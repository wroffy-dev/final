import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { uniqueSuffix } from '../helpers';
import type { SessionUser } from '@/lib/auth/guards';

process.env.MFA_ENCRYPTION_KEY ||= 'test-mfa-key-that-is-long-enough-0123456789';

/**
 * The action layer, exercised through a switchable session identity — the same
 * approach the profile suite uses, because these actions take their user from
 * the session and the point is to prove that.
 */
let currentUser: SessionUser | null = null;
let currentStatus: 'authenticated' | 'mfa-setup' | 'mfa-pending' = 'authenticated';
let canResetOthers = true;

vi.doMock('@/lib/auth/guards', () => {
  class AuthorizationError extends Error {
    constructor(permission: string) {
      super(`Missing permission: ${permission}`);
      this.name = 'AuthorizationError';
    }
  }
  const requireUser = () => {
    if (!currentUser) throw new AuthorizationError('authentication');
    return currentUser;
  };
  return {
    AuthorizationError,
    getCurrentUser: async () => (currentStatus === 'authenticated' ? currentUser : null),
    requireUser: async () => requireUser(),
    requirePermission: async () => requireUser(),
    userCan: (_user: unknown, permission: string) =>
      permission === 'user.mfa.reset' ? canResetOthers : true,
    userCanAny: () => true,
    authorize: async (permission: string) => {
      if (permission === 'user.mfa.reset' && !canResetOthers) {
        throw new AuthorizationError(permission);
      }
      return requireUser();
    },
    authorizeSelf: async () => {
      if (currentStatus !== 'authenticated') throw new AuthorizationError('authentication');
      return requireUser();
    },
    authorizePartial: async () => ({ user: requireUser(), status: currentStatus }),
    requirePartialUser: async () => ({ user: requireUser(), status: currentStatus }),
    getAuthState: async () => ({ status: currentStatus, user: currentUser }),
  };
});

const { prisma } = await import('@/lib/db/prisma');
const { hashPassword } = await import('@/lib/auth/password');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');
const {
  startMfaEnrollment,
  confirmMfaEnrollment,
  verifyLoginMfa,
  verifyRecoveryCode,
  resetMyMfa,
  regenerateMyRecoveryCodes,
} = await import('@/lib/actions/mfa');
const { adminResetUserMfa } = await import('@/lib/actions/staff');
const { decryptTotpSecret } = await import('@/lib/mfa/crypto');
const { TOTP_PERIOD } = await import('@/lib/mfa/totp');
const { countRemainingRecoveryCodes } = await import('@/lib/mfa/mfa.service');
const { createPendingSession, markSessionMfaVerified, loadSession } = await import(
  '@/lib/auth/session.service'
);

const suffix = uniqueSuffix();
const PASSWORD = 'CorrectHorse9Battery';
const createdUserIds: string[] = [];
let roleId = '';

function codeFor(secret: string, offsetSteps = 0): string {
  return new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD,
    secret: Secret.fromBase32(secret),
  }).generate({ timestamp: Date.now() + offsetSteps * TOTP_PERIOD * 1000 });
}

async function pendingSecret(userId: string): Promise<string> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { twoFactorPending: true },
  });
  return decryptTotpSecret(row.twoFactorPending)!;
}

async function makeUser(label: string) {
  const account = await prisma.user.create({
    data: {
      email: `act-${label}-${suffix}@example.test`,
      name: `Action ${label}`,
      passwordHash: await hashPassword(PASSWORD),
      roleId,
    },
  });
  createdUserIds.push(account.id);

  const sessionId = await createPendingSession(account.id);
  const session: SessionUser = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: 'super-admin',
    permissions: [],
    sessionId,
  };
  return { account, session };
}

/** Runs a full enrolment through the action layer, as the UI does. */
async function enrolViaActions(user: { session: SessionUser }) {
  currentStatus = 'mfa-setup';
  currentUser = user.session;

  const offer = await startMfaEnrollment();
  expect(offer.ok).toBe(true);

  const secret = await pendingSecret(user.session.id);
  const done = await confirmMfaEnrollment(codeFor(secret));
  expect(done.ok).toBe(true);

  currentStatus = 'authenticated';
  return { secret, recoveryCodes: done.ok ? (done.data?.recoveryCodes ?? []) : [] };
}

beforeAll(async () => {
  const role = await prisma.userRole.findFirst({ where: { slug: 'super-admin' } });
  roleId =
    role?.id ??
    (
      await prisma.userRole.create({
        data: { name: `Action Test Role ${suffix}`, slug: `act-test-${suffix}`, rank: 500 },
      })
    ).id;
});

beforeEach(() => {
  __resetRateLimits();
  currentUser = null;
  currentStatus = 'authenticated';
  canResetOthers = true;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { slug: `act-test-${suffix}` } });
});

describe('forced enrollment', () => {
  it('enrols and clears the session challenge in one step', async () => {
    const user = await makeUser('forced');
    await enrolViaActions(user);

    const session = await loadSession(user.session.sessionId);
    // Proving possession of the authenticator satisfies this sign-in too.
    expect(session!.mfaVerifiedAt).toBeInstanceOf(Date);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.session.id } });
    expect(row.twoFactorEnabled).toBe(true);
  });

  it('leaves the session unverified when the code is wrong', async () => {
    const user = await makeUser('forced-bad');
    currentStatus = 'mfa-setup';
    currentUser = user.session;

    await startMfaEnrollment();
    const result = await confirmMfaEnrollment('000000');

    expect(result.ok).toBe(false);
    const session = await loadSession(user.session.sessionId);
    expect(session!.mfaVerifiedAt).toBeNull();
  });

  it('refuses enrollment to a session that owes a code for an existing authenticator', async () => {
    const user = await makeUser('cant-reenrol');
    await enrolViaActions(user);

    // A fresh sign-in: enrolled, awaiting a code.
    currentStatus = 'mfa-pending';
    const result = await startMfaEnrollment();

    expect(result.ok).toBe(false);
  });

  it('requires the current password when starting setup while signed in', async () => {
    const user = await makeUser('setup-authed');
    currentStatus = 'authenticated';
    currentUser = user.session;

    expect((await startMfaEnrollment()).ok).toBe(false);
    expect((await startMfaEnrollment('WrongPassword1')).ok).toBe(false);
    expect((await startMfaEnrollment(PASSWORD)).ok).toBe(true);
  });
});

describe('login verification', () => {
  it('verifies the session with a valid code', async () => {
    const user = await makeUser('login-ok');
    const { secret } = await enrolViaActions(user);

    const fresh = await createPendingSession(user.session.id);
    currentUser = { ...user.session, sessionId: fresh };
    currentStatus = 'mfa-pending';

    const result = await verifyLoginMfa(codeFor(secret, 1));

    expect(result.ok).toBe(true);
    expect((await loadSession(fresh))!.mfaVerifiedAt).toBeInstanceOf(Date);
  });

  it('leaves the session unverified on a wrong code', async () => {
    const user = await makeUser('login-bad');
    await enrolViaActions(user);

    const fresh = await createPendingSession(user.session.id);
    currentUser = { ...user.session, sessionId: fresh };
    currentStatus = 'mfa-pending';

    const result = await verifyLoginMfa('000000');

    expect(result.ok).toBe(false);
    expect((await loadSession(fresh))!.mfaVerifiedAt).toBeNull();
  });

  it('accepts a recovery code once and refuses it afterwards', async () => {
    const user = await makeUser('login-recovery');
    const { recoveryCodes } = await enrolViaActions(user);

    const first = await createPendingSession(user.session.id);
    currentUser = { ...user.session, sessionId: first };
    currentStatus = 'mfa-pending';
    expect((await verifyRecoveryCode(recoveryCodes[0]!)).ok).toBe(true);
    expect((await loadSession(first))!.mfaVerifiedAt).toBeInstanceOf(Date);

    const second = await createPendingSession(user.session.id);
    currentUser = { ...user.session, sessionId: second };
    currentStatus = 'mfa-pending';
    expect((await verifyRecoveryCode(recoveryCodes[0]!)).ok).toBe(false);
    expect((await loadSession(second))!.mfaVerifiedAt).toBeNull();
  });
});

describe('self-service reset', () => {
  it('requires both the password and a live code', async () => {
    const user = await makeUser('reset-reauth');
    const { secret } = await enrolViaActions(user);

    expect((await resetMyMfa({ currentPassword: 'WrongPassword1', token: codeFor(secret, 1) })).ok).toBe(
      false,
    );
    expect((await resetMyMfa({ currentPassword: PASSWORD, token: '000000' })).ok).toBe(false);

    // Still enabled after both failures.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.session.id } });
    expect(row.twoFactorEnabled).toBe(true);
  });

  it('clears the old credential, issues a new QR and signs other devices out', async () => {
    const user = await makeUser('reset-ok');
    const { secret, recoveryCodes } = await enrolViaActions(user);
    await markSessionMfaVerified(user.session.sessionId, 'TOTP');

    const otherDevice = await createPendingSession(user.session.id);
    await markSessionMfaVerified(otherDevice, 'TOTP');

    const result = await resetMyMfa({ currentPassword: PASSWORD, token: codeFor(secret, 1) });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data?.qrDataUri.startsWith('data:image/png;base64,')).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.session.id } });
    expect(row.twoFactorEnabled).toBe(false);
    expect(row.twoFactorSecret).toBeNull();
    // The new enrolment secret is not the old one.
    expect(decryptTotpSecret(row.twoFactorPending)).not.toBe(secret);

    // Old recovery codes are gone too.
    expect(await countRemainingRecoveryCodes(user.session.id)).toBe(0);
    void recoveryCodes;

    expect(await loadSession(otherDevice)).toBeNull();
    expect(await loadSession(user.session.sessionId)).not.toBeNull();
  });
});

describe('recovery code regeneration', () => {
  it('requires both the password and a live code', async () => {
    const user = await makeUser('regen-reauth');
    const { secret } = await enrolViaActions(user);

    expect(
      (await regenerateMyRecoveryCodes({ currentPassword: 'WrongPassword1', token: codeFor(secret, 1) }))
        .ok,
    ).toBe(false);
    expect((await regenerateMyRecoveryCodes({ currentPassword: PASSWORD, token: '000000' })).ok).toBe(
      false,
    );
  });

  it('issues a fresh set and invalidates the old one', async () => {
    const user = await makeUser('regen-ok');
    const { secret, recoveryCodes } = await enrolViaActions(user);

    const result = await regenerateMyRecoveryCodes({
      currentPassword: PASSWORD,
      token: codeFor(secret, 1),
    });

    expect(result.ok).toBe(true);
    const fresh = result.ok ? (result.data?.recoveryCodes ?? []) : [];
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toEqual(expect.arrayContaining(recoveryCodes));

    // An old code no longer opens a pending session.
    const session = await createPendingSession(user.session.id);
    currentUser = { ...user.session, sessionId: session };
    currentStatus = 'mfa-pending';
    expect((await verifyRecoveryCode(recoveryCodes[0]!)).ok).toBe(false);
  });
});

describe('administrator-assisted reset', () => {
  it('clears the credential and signs every one of that user session out', async () => {
    const target = await makeUser('admin-target');
    await enrolViaActions(target);
    await markSessionMfaVerified(target.session.sessionId, 'TOTP');

    const admin = await makeUser('admin-actor');
    currentUser = admin.session;
    currentStatus = 'authenticated';

    const result = await adminResetUserMfa(target.session.id);

    expect(result.ok).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.session.id } });
    expect(row.twoFactorEnabled).toBe(false);
    expect(row.twoFactorSecret).toBeNull();
    expect(await countRemainingRecoveryCodes(target.session.id)).toBe(0);
    // Unlike a self-service reset, the target keeps no session at all.
    expect(await loadSession(target.session.sessionId)).toBeNull();
  });

  it('is refused without the user.mfa.reset permission', async () => {
    const target = await makeUser('perm-target');
    await enrolViaActions(target);

    const admin = await makeUser('perm-actor');
    currentUser = admin.session;
    currentStatus = 'authenticated';
    canResetOthers = false;

    const result = await adminResetUserMfa(target.session.id);

    expect(result.ok).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.session.id } });
    expect(row.twoFactorEnabled).toBe(true);
  });

  it('records the administrator as the actor and the target as the subject', async () => {
    const target = await makeUser('audit-target');
    await enrolViaActions(target);

    const admin = await makeUser('audit-actor');
    currentUser = admin.session;
    currentStatus = 'authenticated';

    await adminResetUserMfa(target.session.id);

    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'Security', entityId: target.session.id, action: 'MFA_RESET_BY_ADMIN' },
    });

    expect(entry).not.toBeNull();
    expect(entry!.actorId).toBe(admin.session.id);
    expect(entry!.actorEmail).toBe(admin.session.email);
  });
});
