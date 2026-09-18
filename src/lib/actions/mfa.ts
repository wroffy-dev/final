'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorizePartial, authorizeSelf } from '@/lib/auth/guards';
import { verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/utils/rate-limit';
import { recordSecurityEvent } from '@/lib/security/security-log';
import { markSessionMfaVerified, revokeUserSessions } from '@/lib/auth/session.service';
import {
  beginEnrollment,
  completeEnrollment,
  consumeRecoveryCode,
  clearMfaCredentials,
  issueRecoveryCodes,
  verifyUserTotpDetailed,
  MfaError,
  REPLAYED_CODE_ERROR,
  GENERIC_CODE_ERROR,
  COOLDOWN_ERROR,
  type EnrollmentOffer,
} from '@/lib/mfa/mfa.service';
import { success, failure, type ActionResult } from '@/lib/utils/result';

/**
 * Two-factor actions.
 *
 * Split by the state they accept rather than by the screen that calls them:
 * `startMfaEnrollment` and `confirmMfaEnrollment` work for a pending session
 * (forced onboarding) and for a fully signed-in one (My Profile), which is why
 * the two screens can share one panel component. Anything that changes an
 * existing credential re-authenticates first.
 */

const codeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().length(6, GENERIC_CODE_ERROR));

/**
 * Re-authentication failure.
 *
 * Says nothing about which half failed, with one exception: a code that was
 * correct but already spent gets its own message. The caller is already fully
 * signed in at this point, so there is no third party to inform, and "invalid
 * code" for a code the user can see on their screen is the kind of error
 * people retype four times before giving up.
 */
function reauthMessage(
  passwordOk: boolean,
  check: { ok: false; reason: 'invalid' | 'replayed' } | { ok: true },
): ActionResult<never> {
  if (passwordOk && !check.ok && check.reason === 'replayed') {
    return failure(REPLAYED_CODE_ERROR);
  }
  return failure('That password or verification code was not correct.');
}

async function checkTotp(userId: string, token: string, purpose: string) {
  const parsed = codeSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: 'invalid' } as const;
  return verifyUserTotpDetailed(userId, parsed.data, purpose);
}

function toMfaError(error: unknown): ActionResult<never> {
  if (error instanceof MfaError) return failure(error.message);
  if (error instanceof z.ZodError) return failure(GENERIC_CODE_ERROR);
  console.error('[mfa]', (error as Error)?.name ?? 'error');
  return failure('Something went wrong. Please try again.');
}

/**
 * Produces a QR code.
 *
 * Allowed from a pending session (the user is being forced to enrol) and from
 * a fully authenticated one — but in the latter case only after the current
 * password is re-entered, because the caller already has a live session and a
 * borrowed laptop must not be enough to re-point someone's second factor.
 */
export async function startMfaEnrollment(
  currentPassword?: string,
): Promise<ActionResult<EnrollmentOffer>> {
  try {
    const { user, status } = await authorizePartial();

    if (status === 'authenticated') {
      const ok = await checkPassword(user.id, currentPassword ?? '');
      if (!ok) return failure('That password was not correct.');
    } else if (status !== 'mfa-setup') {
      // A session that owes a code cannot use enrolment to sidestep it.
      return failure('Finish verifying your existing authenticator first.');
    }

    return success(await beginEnrollment(user.id));
  } catch (error) {
    return toMfaError(error);
  }
}

/**
 * Verifies the first code and turns MFA on.
 *
 * When this runs during forced onboarding it also clears the session's MFA
 * challenge — the user has just proved possession of the authenticator, so
 * asking for a second code immediately afterwards would be theatre.
 */
export async function confirmMfaEnrollment(
  token: string,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  try {
    const { user, status } = await authorizePartial();
    const code = codeSchema.parse(token);

    const result = await completeEnrollment(user.id, code);

    if (status === 'mfa-setup') {
      await markSessionMfaVerified(user.sessionId, 'SETUP');
      // Any other half-finished sign-in for this account is now stale.
      await revokeUserSessions(user.id, 'MFA_RESET', user.sessionId);
    }

    return success(result);
  } catch (error) {
    return toMfaError(error);
  }
}

/** The sign-in challenge. Only a pending session may call it. */
export async function verifyLoginMfa(token: string): Promise<ActionResult> {
  try {
    const { user, status } = await authorizePartial();
    if (status === 'authenticated') return success(undefined, 'Already verified.');
    if (status !== 'mfa-pending') return failure('Set up Microsoft Authenticator first.');

    const code = codeSchema.parse(token);
    // Deliberately generic here: a replayed code and a wrong one get the same
    // answer, so someone holding a captured code cannot learn whether the
    // account owner has just signed in with it.
    const result = await verifyUserTotpDetailed(user.id, code, 'login');
    if (!result.ok) return failure(GENERIC_CODE_ERROR);

    await markSessionMfaVerified(user.sessionId, 'TOTP');

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'MFA_LOGIN_VERIFIED',
      summary: 'Signed in with Microsoft Authenticator',
    });

    return success();
  } catch (error) {
    return toMfaError(error);
  }
}

/** The "lost my phone" path at sign-in. Each code works exactly once. */
export async function verifyRecoveryCode(code: string): Promise<ActionResult> {
  try {
    const { user, status } = await authorizePartial();
    if (status === 'authenticated') return success(undefined, 'Already verified.');
    if (status !== 'mfa-pending') return failure('Set up Microsoft Authenticator first.');

    const ok = await consumeRecoveryCode(user.id, code);
    if (!ok) return failure('That recovery code is not valid or has already been used.');

    await markSessionMfaVerified(user.sessionId, 'RECOVERY_CODE');

    return success();
  } catch (error) {
    return toMfaError(error);
  }
}

/**
 * Self-service reset: point the account at a new authenticator.
 *
 * Requires the password *and* a code from the authenticator being replaced, so
 * losing the phone is not enough to take the account over — that case is the
 * recovery code, or an administrator.
 */
export async function resetMyMfa(input: {
  currentPassword: string;
  token: string;
}): Promise<ActionResult<EnrollmentOffer>> {
  try {
    const user = await authorizeSelf();

    if (!rateLimit(`mfa:reset:${user.id}`, 5, 900).ok) return failure(COOLDOWN_ERROR);

    const passwordOk = await checkPassword(user.id, input.currentPassword);
    const check = await checkTotp(user.id, input.token, 'reset');
    if (!passwordOk || !check.ok) return reauthMessage(passwordOk, check);

    // Old secret and old recovery codes stop working now, not after the new
    // authenticator is confirmed: a reset the user did not finish must not
    // leave the previous credential usable.
    await clearMfaCredentials(user.id);
    await revokeUserSessions(user.id, 'MFA_RESET', user.sessionId);

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'MFA_RESET_BY_USER',
      summary: 'Reset Microsoft Authenticator; other sessions signed out',
    });

    return success(await beginEnrollment(user.id));
  } catch (error) {
    return toMfaError(error);
  }
}

/** New recovery codes; the previous set is invalidated. */
export async function regenerateMyRecoveryCodes(input: {
  currentPassword: string;
  token: string;
}): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  try {
    const user = await authorizeSelf();

    if (!rateLimit(`mfa:regen:${user.id}`, 5, 900).ok) return failure(COOLDOWN_ERROR);

    const passwordOk = await checkPassword(user.id, input.currentPassword);
    const check = await checkTotp(user.id, input.token, 'regen');
    if (!passwordOk || !check.ok) return reauthMessage(passwordOk, check);

    const recoveryCodes = await issueRecoveryCodes(user.id);

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'RECOVERY_CODES_REGENERATED',
      summary: 'Generated a new set of recovery codes; earlier codes invalidated',
    });

    return success({ recoveryCodes });
  } catch (error) {
    return toMfaError(error);
  }
}

/** Shared re-authentication check. Compares against the stored hash only. */
async function checkPassword(userId: string, plain: string): Promise<boolean> {
  if (!plain) return false;
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!account?.passwordHash) return false;
  return verifyPassword(plain, account.passwordHash);
}
