import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { rateLimit } from '@/lib/utils/rate-limit';
import { recordSecurityEvent } from '@/lib/security/security-log';
import {
  encryptTotpSecret,
  decryptTotpSecret,
  hashRecoveryCode,
  mfaKeyConfigured,
} from './crypto';
import {
  generateTotpSecret,
  otpauthUri,
  qrCodeDataUri,
  formatSecretForDisplay,
  verifyTotp,
} from './totp';

/**
 * The single implementation of two-factor authentication.
 *
 * Both entry points — the forced enrolment at first sign-in and the voluntary
 * re-enrolment in My Profile — call these functions. There is deliberately no
 * second code path: a duplicate would be the one that drifts and stops
 * checking something.
 */

export const RECOVERY_CODE_COUNT = 10;

/** Five wrong codes buys a five-minute pause, per account and per action. */
const MFA_ATTEMPT_LIMIT = 5;
const MFA_ATTEMPT_WINDOW_SECONDS = 300;

export const GENERIC_CODE_ERROR = 'Invalid verification code.';
export const COOLDOWN_ERROR = 'Too many attempts. Please try again later.';

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MfaError';
  }
}

/**
 * Throttles an attempt. The bucket is keyed by user and purpose so a failed
 * enrolment cannot lock someone out of signing in.
 */
export function guardAttempts(userId: string, purpose: string): void {
  const result = rateLimit(`mfa:${purpose}:${userId}`, MFA_ATTEMPT_LIMIT, MFA_ATTEMPT_WINDOW_SECONDS);
  if (!result.ok) throw new MfaError(COOLDOWN_ERROR);
}

export type EnrollmentOffer = {
  qrDataUri: string;
  /** Shown under "can't scan?"; the same secret, grouped for typing. */
  manualKey: string;
  accountLabel: string;
  issuer: string;
};

/**
 * Starts enrolment.
 *
 * The new secret is stored encrypted in `twoFactorPending`, never in
 * `twoFactorSecret`: an enrolment that is abandoned half-way must not be able
 * to lock the account, and MFA is not enabled until a code proves the user
 * really has the secret in their app.
 *
 * Calling this again replaces the pending secret, so a user who closed the tab
 * simply gets a fresh QR code.
 */
export async function beginEnrollment(userId: string): Promise<EnrollmentOffer> {
  if (!mfaKeyConfigured()) {
    throw new MfaError(
      'Two-factor authentication is not configured on this server. Contact your administrator.',
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw new MfaError('That account no longer exists.');

  const secret = generateTotpSecret();

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorPending: encryptTotpSecret(secret) },
  });

  await recordSecurityEvent({
    userId,
    userEmail: user.email,
    action: 'MFA_SETUP_STARTED',
    summary: 'Started Microsoft Authenticator setup',
  });

  const uri = otpauthUri(secret, user.email);

  return {
    qrDataUri: await qrCodeDataUri(uri),
    manualKey: formatSecretForDisplay(secret),
    accountLabel: user.email,
    issuer: process.env.MFA_ISSUER || 'Dropbox Reseller',
  };
}

/**
 * Finishes enrolment: verifies a code against the pending secret and, only
 * then, promotes it and issues recovery codes.
 *
 * Returns the codes so the caller can show them once. They are never
 * retrievable afterwards.
 */
export async function completeEnrollment(
  userId: string,
  token: string,
): Promise<{ recoveryCodes: string[] }> {
  guardAttempts(userId, 'setup');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorPending: true },
  });
  if (!user) throw new MfaError('That account no longer exists.');

  const secret = decryptTotpSecret(user.twoFactorPending);
  if (!secret) {
    throw new MfaError('That setup session has expired. Start again to get a new QR code.');
  }

  const check = verifyTotp(secret, token);
  if (!check.ok) {
    await recordSecurityEvent({
      userId,
      userEmail: user.email,
      action: 'MFA_VERIFICATION_FAILED',
      summary: 'Incorrect code during Microsoft Authenticator setup',
    });
    throw new MfaError(GENERIC_CODE_ERROR);
  }

  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encryptTotpSecret(secret),
      twoFactorPending: null,
      twoFactorEnabled: true,
      twoFactorVerifiedAt: now,
      twoFactorLastUsedAt: now,
      twoFactorLastStep: BigInt(check.step),
    },
  });

  const recoveryCodes = await issueRecoveryCodes(userId);

  await recordSecurityEvent({
    userId,
    userEmail: user.email,
    action: 'MFA_ENABLED',
    summary: 'Microsoft Authenticator enabled and recovery codes issued',
  });

  return { recoveryCodes };
}

export type TotpResult =
  | { ok: true }
  /** Wrong, malformed, or outside the accepted window. */
  | { ok: false; reason: 'invalid' }
  /** Correct, but these six digits have already been spent. */
  | { ok: false; reason: 'replayed' };

/**
 * Verifies a code against the *enabled* secret, for signing in and for
 * re-authenticating before a sensitive change.
 *
 * Replay protection: a code is accepted only if its time step is newer than
 * the last one accepted, so the same six digits cannot be used twice even
 * within the thirty seconds they remain mathematically valid.
 *
 * The result distinguishes "wrong" from "already used" because the two need
 * different answers. At sign-in the caller collapses both into one generic
 * message, so an attacker holding a captured code learns nothing about
 * whether the account owner has just used it. Once a user is fully signed in
 * there is no such attacker to inform, and telling them to wait for the next
 * code is the difference between a working screen and a baffling one.
 */
export async function verifyUserTotpDetailed(
  userId: string,
  token: string,
  purpose: string,
): Promise<TotpResult> {
  guardAttempts(userId, purpose);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorSecret: true, twoFactorEnabled: true, twoFactorLastStep: true },
  });
  if (!user || !user.twoFactorEnabled) return { ok: false, reason: 'invalid' };

  const secret = decryptTotpSecret(user.twoFactorSecret);
  if (!secret) return { ok: false, reason: 'invalid' };

  const check = verifyTotp(secret, token);
  if (!check.ok) {
    await recordSecurityEvent({
      userId,
      userEmail: user.email,
      action: 'MFA_VERIFICATION_FAILED',
      summary: 'Incorrect verification code',
    });
    return { ok: false, reason: 'invalid' };
  }

  if (user.twoFactorLastStep !== null && BigInt(check.step) <= user.twoFactorLastStep) {
    await recordSecurityEvent({
      userId,
      userEmail: user.email,
      action: 'MFA_VERIFICATION_FAILED',
      summary: 'Verification code had already been used',
    });
    return { ok: false, reason: 'replayed' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorLastStep: BigInt(check.step), twoFactorLastUsedAt: new Date() },
  });

  return { ok: true };
}

/** Boolean form, for callers that treat every failure the same way. */
export async function verifyUserTotp(
  userId: string,
  token: string,
  purpose: string,
): Promise<boolean> {
  return (await verifyUserTotpDetailed(userId, token, purpose)).ok;
}

export const REPLAYED_CODE_ERROR =
  'That code has already been used. Wait for your authenticator to show the next one.';

/**
 * Consumes a recovery code.
 *
 * The lookup is by keyed hash, and the update is conditional on `usedAt` still
 * being null, so two simultaneous attempts with the same code cannot both
 * succeed.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  guardAttempts(userId, 'recovery');

  const hash = hashRecoveryCode(code);

  const result = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hash, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (result.count === 0) return false;

  const remaining = await prisma.recoveryCode.count({ where: { userId, usedAt: null } });

  await recordSecurityEvent({
    userId,
    action: 'RECOVERY_CODE_USED',
    summary: `Recovery code used; ${remaining} remaining`,
  });

  return true;
}

/** Replaces every code with a fresh set. Old codes stop working immediately. */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);

  return codes;
}

/**
 * Twelve characters from an unambiguous alphabet, as ABCD-EFGH-IJKL.
 *
 * I, O, 0 and 1 are left out so a code read off a printout cannot be mistyped
 * in a way that silently fails. Sampling is rejection-based rather than
 * modulo, which would bias the first characters of the alphabet.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRecoveryCode(): string {
  const chars: string[] = [];
  while (chars.length < 12) {
    for (const byte of crypto.randomBytes(24)) {
      if (byte >= 256 - (256 % RECOVERY_ALPHABET.length)) continue;
      chars.push(RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]!);
      if (chars.length === 12) break;
    }
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export async function countRemainingRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}

/**
 * Clears every authenticator credential for a user.
 *
 * Used by both the self-service reset and the administrator-assisted one. The
 * caller is responsible for revoking sessions; this function only removes the
 * credentials, so the two concerns stay separable.
 */
export async function clearMfaCredentials(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPending: null,
        twoFactorVerifiedAt: null,
        twoFactorLastUsedAt: null,
        twoFactorLastStep: null,
      },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}

export type MfaStatus = {
  enabled: boolean;
  required: boolean;
  configuredAt: Date | null;
  lastVerifiedAt: Date | null;
  recoveryCodesRemaining: number;
  serverConfigured: boolean;
};

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [user, remaining] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorRequired: true,
        twoFactorVerifiedAt: true,
        twoFactorLastUsedAt: true,
      },
    }),
    countRemainingRecoveryCodes(userId),
  ]);

  return {
    enabled: user?.twoFactorEnabled ?? false,
    required: user?.twoFactorRequired ?? true,
    configuredAt: user?.twoFactorVerifiedAt ?? null,
    lastVerifiedAt: user?.twoFactorLastUsedAt ?? null,
    recoveryCodesRemaining: remaining,
    serverConfigured: mfaKeyConfigured(),
  };
}
