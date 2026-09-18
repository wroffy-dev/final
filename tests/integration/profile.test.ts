import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { uniqueSuffix } from '../helpers';
import type { SessionUser } from '@/lib/auth/guards';

process.env.MFA_ENCRYPTION_KEY ||= 'test-mfa-key-that-is-long-enough-0123456789';

/**
 * The profile actions take their user id from the session and never from their
 * arguments, so the mock has to be a real, switchable identity rather than the
 * fixed actor the other suites use.
 */
let currentUser: SessionUser | null = null;

vi.doMock('@/lib/auth/guards', () => {
  class AuthorizationError extends Error {
    constructor(permission: string) {
      super(`Missing permission: ${permission}`);
      this.name = 'AuthorizationError';
    }
  }
  return {
    AuthorizationError,
    getCurrentUser: async () => currentUser,
    requireUser: async () => currentUser,
    requirePermission: async () => currentUser,
    userCan: () => true,
    userCanAny: () => true,
    authorize: async () => currentUser,
    authorizeSelf: async () => {
      if (!currentUser) throw new AuthorizationError('authentication');
      return currentUser;
    },
    authorizePartial: async () => ({ user: currentUser, status: 'authenticated' as const }),
    getAuthState: async () => ({ status: 'authenticated' as const, user: currentUser }),
  };
});

const { prisma } = await import('@/lib/db/prisma');
const { hashPassword, verifyPassword } = await import('@/lib/auth/password');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');
const {
  updateMyProfile,
  updateMyPersonalDetails,
  changeMyPassword,
  changeMyEmail,
  revokeMyOtherSessions,
  revokeMySession,
} = await import('@/lib/actions/profile');
const { createPendingSession, markSessionMfaVerified, loadSession } = await import(
  '@/lib/auth/session.service'
);
const { getMyProfile } = await import('@/lib/services/profile');

const suffix = uniqueSuffix();
const PASSWORD = 'CorrectHorse9Battery';
const createdUserIds: string[] = [];
let roleId = '';

async function makeUser(label: string) {
  const account = await prisma.user.create({
    data: {
      email: `profile-${label}-${suffix}@example.test`,
      name: `Profile ${label}`,
      passwordHash: await hashPassword(PASSWORD),
      roleId,
    },
  });
  createdUserIds.push(account.id);

  const sessionId = await createPendingSession(account.id);
  await markSessionMfaVerified(sessionId, 'TOTP');

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

beforeAll(async () => {
  const role = await prisma.userRole.findFirst({ where: { slug: 'super-admin' } });
  roleId =
    role?.id ??
    (
      await prisma.userRole.create({
        data: { name: `Profile Test Role ${suffix}`, slug: `profile-test-${suffix}`, rank: 500 },
      })
    ).id;
});

beforeEach(() => {
  __resetRateLimits();
  currentUser = null;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { slug: `profile-test-${suffix}` } });
});

describe('profile editing', () => {
  it('updates the signed-in user own details', async () => {
    const { account, session } = await makeUser('edit');
    currentUser = session;

    const result = await updateMyProfile({
      name: 'Updated Name',
      phone: '+91 90000 00000',
      jobTitle: 'Head of Support',
      department: 'Support',
      timezone: 'Asia/Kolkata',
    });

    expect(result.ok).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.name).toBe('Updated Name');
    expect(row.jobTitle).toBe('Head of Support');
    expect(row.department).toBe('Support');
    expect(row.timezone).toBe('Asia/Kolkata');
  });

  it('saves personal details and clears blanks to null', async () => {
    const { account, session } = await makeUser('personal');
    currentUser = session;

    await updateMyPersonalDetails({
      addressLine1: '1 Example Road',
      addressLine2: '',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      alternatePhone: '',
      bio: 'Looks after the support queue.',
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.addressLine1).toBe('1 Example Road');
    expect(row.city).toBe('Pune');
    expect(row.addressLine2).toBeNull();
    expect(row.alternatePhone).toBeNull();
  });

  it('rejects a timezone Intl does not recognise', async () => {
    const { session } = await makeUser('tz');
    currentUser = session;

    const result = await updateMyProfile({ name: 'Zone Test', timezone: 'Mars/Olympus_Mons' });

    expect(result.ok).toBe(false);
  });

  it('requires a name', async () => {
    const { session } = await makeUser('noname');
    currentUser = session;

    const result = await updateMyProfile({ name: '   ' });
    expect(result.ok).toBe(false);
  });

  it('refuses to run at all when nobody is signed in', async () => {
    currentUser = null;
    const result = await updateMyProfile({ name: 'Nobody' });
    expect(result.ok).toBe(false);
  });

  /**
   * The central guarantee of the whole screen: a payload naming somebody else
   * cannot reach their record, because the id is never read from the payload.
   */
  it("cannot be steered at another user's record by its arguments", async () => {
    const victim = await makeUser('victim');
    const attacker = await makeUser('attacker');
    currentUser = attacker.session;

    await updateMyProfile({
      // Every shape an attacker might try. None of them is consulted.
      id: victim.account.id,
      userId: victim.account.id,
      email: victim.account.email,
      name: 'Taken Over',
    } as unknown);

    const victimRow = await prisma.user.findUniqueOrThrow({ where: { id: victim.account.id } });
    const attackerRow = await prisma.user.findUniqueOrThrow({ where: { id: attacker.account.id } });

    expect(victimRow.name).toBe(victim.account.name);
    expect(victimRow.email).toBe(victim.account.email);
    expect(attackerRow.name).toBe('Taken Over');
  });

  it('cannot change its own role, permissions or status', async () => {
    const { account, session } = await makeUser('privesc');
    currentUser = session;

    const otherRole = await prisma.userRole.findFirst({
      where: { NOT: { id: account.roleId } },
      select: { id: true },
    });

    await updateMyProfile({
      name: 'Still Ordinary',
      roleId: otherRole?.id ?? 'anything',
      status: 'SUSPENDED',
      twoFactorRequired: false,
      permissions: ['staff.manage'],
    } as unknown);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.roleId).toBe(account.roleId);
    expect(row.status).toBe('ACTIVE');
    expect(row.twoFactorRequired).toBe(true);
  });
});

describe('password change', () => {
  it('changes the password when the current one is correct', async () => {
    const { account, session } = await makeUser('pw-ok');
    currentUser = session;

    const before = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });

    const result = await changeMyPassword({
      currentPassword: PASSWORD,
      newPassword: 'BrandNewPass77',
      confirmPassword: 'BrandNewPass77',
    });

    expect(result.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await verifyPassword('BrandNewPass77', after.passwordHash!)).toBe(true);
    expect(await verifyPassword(PASSWORD, after.passwordHash!)).toBe(false);
    expect(after.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('rejects a wrong current password and leaves the hash alone', async () => {
    const { account, session } = await makeUser('pw-wrong');
    currentUser = session;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });

    const result = await changeMyPassword({
      currentPassword: 'NotThePassword1',
      newPassword: 'BrandNewPass77',
      confirmPassword: 'BrandNewPass77',
    });

    expect(result.ok).toBe(false);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('rejects a confirmation that does not match', async () => {
    const { session } = await makeUser('pw-mismatch');
    currentUser = session;

    const result = await changeMyPassword({
      currentPassword: PASSWORD,
      newPassword: 'BrandNewPass77',
      confirmPassword: 'DifferentPass77',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.confirmPassword).toBeTruthy();
  });

  it('refuses to set the password to the one already in use', async () => {
    const { session } = await makeUser('pw-same');
    currentUser = session;

    const result = await changeMyPassword({
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
      confirmPassword: PASSWORD,
    });

    expect(result.ok).toBe(false);
  });

  it('enforces the password policy', async () => {
    const { session } = await makeUser('pw-weak');
    currentUser = session;

    const result = await changeMyPassword({
      currentPassword: PASSWORD,
      newPassword: 'short',
      confirmPassword: 'short',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.newPassword).toBeTruthy();
  });

  it('signs out other devices but keeps the one making the change', async () => {
    const { account, session } = await makeUser('pw-sessions');
    const otherDevice = await createPendingSession(account.id);
    await markSessionMfaVerified(otherDevice, 'TOTP');
    currentUser = session;

    await changeMyPassword({
      currentPassword: PASSWORD,
      newPassword: 'BrandNewPass77',
      confirmPassword: 'BrandNewPass77',
    });

    expect(await loadSession(otherDevice)).toBeNull();
    expect(await loadSession(session.sessionId)).not.toBeNull();
  });
});

describe('email change', () => {
  it('changes the address when the password is correct', async () => {
    const { account, session } = await makeUser('em-ok');
    currentUser = session;

    const next = `changed-${suffix}@example.test`;
    const result = await changeMyEmail({ email: next, currentPassword: PASSWORD });

    expect(result.ok).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.email).toBe(next);
  });

  it('requires the current password', async () => {
    const { account, session } = await makeUser('em-nopw');
    currentUser = session;

    const result = await changeMyEmail({
      email: `nope-${suffix}@example.test`,
      currentPassword: 'WrongPassword1',
    });

    expect(result.ok).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.email).toBe(account.email);
  });

  it('refuses an address another account already uses', async () => {
    const taken = await makeUser('em-taken');
    const { account, session } = await makeUser('em-dupe');
    currentUser = session;

    const result = await changeMyEmail({
      email: taken.account.email,
      currentPassword: PASSWORD,
    });

    expect(result.ok).toBe(false);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.email).toBe(account.email);
  });

  it('normalises the address to lower case', async () => {
    const { account, session } = await makeUser('em-case');
    currentUser = session;

    await changeMyEmail({
      email: `MiXeD-${suffix}@Example.TEST`,
      currentPassword: PASSWORD,
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.email).toBe(`mixed-${suffix}@example.test`);
  });

  it('signs out other devices', async () => {
    const { account, session } = await makeUser('em-sessions');
    const otherDevice = await createPendingSession(account.id);
    await markSessionMfaVerified(otherDevice, 'TOTP');
    currentUser = session;

    await changeMyEmail({ email: `moved-${suffix}@example.test`, currentPassword: PASSWORD });

    expect(await loadSession(otherDevice)).toBeNull();
    expect(await loadSession(session.sessionId)).not.toBeNull();
  });
});

describe('session management', () => {
  it('signs out every other device on request', async () => {
    const { account, session } = await makeUser('rev-all');
    const a = await createPendingSession(account.id);
    const b = await createPendingSession(account.id);
    await markSessionMfaVerified(a, 'TOTP');
    await markSessionMfaVerified(b, 'TOTP');
    currentUser = session;

    const result = await revokeMyOtherSessions();

    expect(result.ok).toBe(true);
    expect(await loadSession(a)).toBeNull();
    expect(await loadSession(b)).toBeNull();
    expect(await loadSession(session.sessionId)).not.toBeNull();
  });

  it('refuses to revoke the session making the request', async () => {
    const { session } = await makeUser('rev-self');
    currentUser = session;

    const result = await revokeMySession(session.sessionId);

    expect(result.ok).toBe(false);
    expect(await loadSession(session.sessionId)).not.toBeNull();
  });

  it("cannot revoke another user's session", async () => {
    const victim = await makeUser('rev-victim');
    const attacker = await makeUser('rev-attacker');
    currentUser = attacker.session;

    const result = await revokeMySession(victim.session.sessionId);

    expect(result.ok).toBe(false);
    expect(await loadSession(victim.session.sessionId)).not.toBeNull();
  });
});

describe('profile data loading', () => {
  it("returns only the requested user's own activity", async () => {
    const other = await makeUser('data-other');
    const { session } = await makeUser('data-mine');

    currentUser = other.session;
    await updateMyProfile({ name: 'Other Person Edited' });

    currentUser = session;
    await updateMyProfile({ name: 'My Own Edit' });

    const data = await getMyProfile(session);

    expect(data.profile.id).toBe(session.id);
    expect(data.events.length).toBeGreaterThan(0);
    // Every session and event belongs to this account.
    expect(data.sessions.every((row) => row.id !== other.session.sessionId)).toBe(true);
    expect(JSON.stringify(data.events)).not.toContain(other.account.email);
  });
});
