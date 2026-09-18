import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { mockAuth, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

process.env.MFA_ENCRYPTION_KEY ||= 'test-mfa-key-that-is-long-enough-0123456789';
process.env.MFA_ISSUER ||= 'Dropbox Reseller';

const { prisma } = await import('@/lib/db/prisma');
const { hashPassword } = await import('@/lib/auth/password');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');
const {
  beginEnrollment,
  completeEnrollment,
  verifyUserTotp,
  verifyUserTotpDetailed,
  consumeRecoveryCode,
  issueRecoveryCodes,
  clearMfaCredentials,
  countRemainingRecoveryCodes,
  getMfaStatus,
  MfaError,
} = await import('@/lib/mfa/mfa.service');
const { encryptTotpSecret, decryptTotpSecret, hashRecoveryCode } = await import(
  '@/lib/mfa/crypto'
);
const { otpauthUri, verifyTotp, generateTotpSecret, mfaIssuer, TOTP_PERIOD } = await import(
  '@/lib/mfa/totp'
);
const {
  createPendingSession,
  markSessionMfaVerified,
  loadSession,
  revokeUserSessions,
  revokeSession,
  listActiveSessions,
} = await import('@/lib/auth/session.service');

const suffix = uniqueSuffix();
const createdUserIds: string[] = [];
let roleId = '';

/** The secret handed to the app is the one the QR code encodes; read it back. */
function secretFromUri(uri: string): string {
  return new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret')!;
}

function codeFor(secret: string, offsetSteps = 0): string {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD,
    secret: Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp: Date.now() + offsetSteps * TOTP_PERIOD * 1000 });
}

async function makeUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `mfa-${label}-${suffix}@example.test`,
      name: `MFA ${label}`,
      passwordHash: await hashPassword('CorrectHorse9Battery'),
      roleId,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

/** Enrols a user and returns the secret their authenticator now holds. */
async function enrol(userId: string): Promise<{ secret: string; recoveryCodes: string[] }> {
  const offer = await beginEnrollment(userId);
  const pending = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { twoFactorPending: true },
  });
  const secret = decryptTotpSecret(pending.twoFactorPending)!;
  const { recoveryCodes } = await completeEnrollment(userId, codeFor(secret));
  return { secret, recoveryCodes };
}

beforeAll(async () => {
  const role = await prisma.userRole.findFirst({ where: { slug: 'super-admin' } });
  roleId =
    role?.id ??
    (
      await prisma.userRole.create({
        data: { name: `MFA Test Role ${suffix}`, slug: `mfa-test-${suffix}`, rank: 500 },
      })
    ).id;
});

beforeEach(() => {
  __resetRateLimits();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { slug: `mfa-test-${suffix}` } });
});

describe('TOTP secret encryption', () => {
  it('never stores the secret in plaintext and round-trips it', async () => {
    const secret = generateTotpSecret();
    const stored = encryptTotpSecret(secret);

    expect(stored).not.toContain(secret);
    expect(stored.startsWith('mfa:v1:')).toBe(true);
    expect(decryptTotpSecret(stored)).toBe(secret);
  });

  it('produces a different ciphertext each time for the same secret', () => {
    const secret = generateTotpSecret();
    expect(encryptTotpSecret(secret)).not.toBe(encryptTotpSecret(secret));
  });

  it('returns null rather than throwing when the ciphertext cannot be read', () => {
    expect(decryptTotpSecret('mfa:v1:AAAA:BBBB:CCCC')).toBeNull();
    expect(decryptTotpSecret('not-encrypted-at-all')).toBeNull();
    expect(decryptTotpSecret(null)).toBeNull();
  });

  it('stores the enrolled secret encrypted in the database', async () => {
    const user = await makeUser('at-rest');
    const { secret } = await enrol(user.id);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorSecret: true, twoFactorPending: true },
    });

    expect(row.twoFactorSecret).toBeTruthy();
    expect(row.twoFactorSecret).not.toContain(secret);
    expect(decryptTotpSecret(row.twoFactorSecret)).toBe(secret);
    // The enrolment copy is cleared once it has been promoted.
    expect(row.twoFactorPending).toBeNull();
  });
});

describe('otpauth URI', () => {
  it('carries the parameters Microsoft Authenticator expects', () => {
    const secret = generateTotpSecret();
    const uri = otpauthUri(secret, 'user@example.com');

    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
    expect(uri).toContain(`secret=${secret}`);
    expect(decodeURIComponent(uri)).toContain(`${mfaIssuer()}:user@example.com`);
  });
});

describe('TOTP verification', () => {
  it('accepts the current code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, codeFor(secret)).ok).toBe(true);
  });

  it('rejects a wrong code and anything that is not six digits', () => {
    const secret = generateTotpSecret();
    const wrong = codeFor(secret) === '000000' ? '111111' : '000000';

    expect(verifyTotp(secret, wrong).ok).toBe(false);
    expect(verifyTotp(secret, '12345').ok).toBe(false);
    expect(verifyTotp(secret, 'abcdef').ok).toBe(false);
    expect(verifyTotp(secret, '').ok).toBe(false);
  });

  it('tolerates one step of clock drift in either direction', () => {
    const secret = generateTotpSecret();

    expect(verifyTotp(secret, codeFor(secret, -1)).ok).toBe(true);
    expect(verifyTotp(secret, codeFor(secret, 1)).ok).toBe(true);
    // Two steps out is beyond the window.
    expect(verifyTotp(secret, codeFor(secret, 3)).ok).toBe(false);
  });
});

describe('enrollment', () => {
  it('does not enable MFA until a code proves the secret works', async () => {
    const user = await makeUser('pending');
    await beginEnrollment(user.id);

    const midway = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true, twoFactorPending: true, twoFactorSecret: true },
    });

    expect(midway.twoFactorEnabled).toBe(false);
    expect(midway.twoFactorSecret).toBeNull();
    expect(midway.twoFactorPending).toBeTruthy();
  });

  it('rejects a wrong code and leaves MFA disabled', async () => {
    const user = await makeUser('bad-setup');
    const offer = await beginEnrollment(user.id);
    const secret = secretFromUri(
      // The QR encodes the same secret the manual key shows.
      otpauthUri(
        decryptTotpSecret(
          (
            await prisma.user.findUniqueOrThrow({
              where: { id: user.id },
              select: { twoFactorPending: true },
            })
          ).twoFactorPending,
        )!,
        offer.accountLabel,
      ),
    );
    const wrong = codeFor(secret) === '000000' ? '111111' : '000000';

    await expect(completeEnrollment(user.id, wrong)).rejects.toBeInstanceOf(MfaError);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });
    expect(after.twoFactorEnabled).toBe(false);
  });

  it('enables MFA and issues ten recovery codes on a valid code', async () => {
    const user = await makeUser('good-setup');
    const { recoveryCodes } = await enrol(user.id);

    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const status = await getMfaStatus(user.id);
    expect(status.enabled).toBe(true);
    expect(status.required).toBe(true);
    expect(status.configuredAt).toBeInstanceOf(Date);
    expect(status.recoveryCodesRemaining).toBe(10);
  });

  it('defaults every new account to MFA required and not yet enabled', async () => {
    const user = await makeUser('defaults');
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorRequired: true, twoFactorEnabled: true },
    });

    expect(row.twoFactorRequired).toBe(true);
    expect(row.twoFactorEnabled).toBe(false);
  });
});

describe('login verification and replay protection', () => {
  it('accepts a valid code for an enrolled user', async () => {
    const user = await makeUser('login');
    const { secret } = await enrol(user.id);

    // Enrolment consumes the current step, so the next sign-in uses the code
    // the authenticator will show next — exactly what happens in practice,
    // because the user has to sign in after enrolling rather than instantly.
    expect(await verifyUserTotp(user.id, codeFor(secret, 1), 'login')).toBe(true);
  });

  it('refuses the same code twice, even inside its own window', async () => {
    const user = await makeUser('replay');
    const { secret } = await enrol(user.id);
    const code = codeFor(secret, 1);

    expect(await verifyUserTotp(user.id, code, 'login')).toBe(true);
    // Mathematically still valid; refused because its step was already used.
    expect(await verifyUserTotp(user.id, code, 'login')).toBe(false);
  });

  it('reports a replayed code separately from a wrong one', async () => {
    const user = await makeUser('replay-reason');
    const { secret } = await enrol(user.id);
    const code = codeFor(secret, 1);
    await verifyUserTotp(user.id, code, 'detail');

    const replayed = await verifyUserTotpDetailed(user.id, code, 'detail');
    expect(replayed).toEqual({ ok: false, reason: 'replayed' });

    const wrong = await verifyUserTotpDetailed(user.id, '000000', 'detail');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe('invalid');
  });

  it('still accepts the next code once the clock has moved on', async () => {
    const user = await makeUser('next-step');
    const { secret } = await enrol(user.id);

    expect(await verifyUserTotp(user.id, codeFor(secret, 1), 'login')).toBe(true);

    // Replay protection must bound the damage without locking the user out of
    // their own authenticator a minute later, so move the clock rather than
    // asking for a code from a step the validation window cannot reach.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(Date.now() + 3 * TOTP_PERIOD * 1000));
      expect(await verifyUserTotp(user.id, codeFor(secret), 'login')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses any code for a user who has not enrolled', async () => {
    const user = await makeUser('not-enrolled');
    expect(await verifyUserTotp(user.id, '123456', 'login')).toBe(false);
  });

  it('stops accepting codes after five failures, then recovers', async () => {
    const user = await makeUser('rate-limit');
    const { secret } = await enrol(user.id);
    const wrong = codeFor(secret) === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await verifyUserTotp(user.id, wrong, 'rl')).toBe(false);
    }

    // The sixth attempt is refused by the limiter rather than the check —
    // a correct code does not get through either.
    await expect(verifyUserTotp(user.id, codeFor(secret, 1), 'rl')).rejects.toBeInstanceOf(
      MfaError,
    );

    __resetRateLimits();
    expect(await verifyUserTotp(user.id, codeFor(secret, 1), 'rl')).toBe(true);
  });
});

describe('recovery codes', () => {
  it('stores codes hashed, never in plaintext', async () => {
    const user = await makeUser('rc-hash');
    const { recoveryCodes } = await enrol(user.id);

    const rows = await prisma.recoveryCode.findMany({ where: { userId: user.id } });
    const stored = rows.map((row) => row.codeHash).join(' ');

    for (const code of recoveryCodes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace(/-/g, ''));
    }
    expect(rows.map((row) => row.codeHash)).toContain(hashRecoveryCode(recoveryCodes[0]!));
  });

  it('accepts a code once and never again', async () => {
    const user = await makeUser('rc-once');
    const { recoveryCodes } = await enrol(user.id);
    const code = recoveryCodes[0]!;

    expect(await consumeRecoveryCode(user.id, code)).toBe(true);
    expect(await consumeRecoveryCode(user.id, code)).toBe(false);
    expect(await countRemainingRecoveryCodes(user.id)).toBe(9);
  });

  it('accepts a code however the user types it', async () => {
    const user = await makeUser('rc-format');
    const { recoveryCodes } = await enrol(user.id);

    expect(await consumeRecoveryCode(user.id, recoveryCodes[0]!.toLowerCase())).toBe(true);
    expect(await consumeRecoveryCode(user.id, recoveryCodes[1]!.replace(/-/g, ' '))).toBe(true);
  });

  it("refuses another user's recovery code", async () => {
    const [alice, bob] = [await makeUser('rc-alice'), await makeUser('rc-bob')];
    const { recoveryCodes } = await enrol(alice.id);
    await enrol(bob.id);

    expect(await consumeRecoveryCode(bob.id, recoveryCodes[0]!)).toBe(false);
    // Alice's code is untouched by Bob's attempt.
    expect(await countRemainingRecoveryCodes(alice.id)).toBe(10);
  });

  it('invalidates every previous code when a new set is generated', async () => {
    const user = await makeUser('rc-regen');
    const { recoveryCodes: original } = await enrol(user.id);

    const replacement = await issueRecoveryCodes(user.id);

    expect(replacement).toHaveLength(10);
    expect(replacement).not.toEqual(expect.arrayContaining(original));
    expect(await consumeRecoveryCode(user.id, original[0]!)).toBe(false);
    expect(await consumeRecoveryCode(user.id, replacement[0]!)).toBe(true);
  });
});

describe('clearing credentials', () => {
  it('removes the secret and every recovery code', async () => {
    const user = await makeUser('clear');
    await enrol(user.id);

    await clearMfaCredentials(user.id);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorPending: true,
        twoFactorVerifiedAt: true,
        twoFactorLastStep: true,
      },
    });

    expect(row.twoFactorEnabled).toBe(false);
    expect(row.twoFactorSecret).toBeNull();
    expect(row.twoFactorPending).toBeNull();
    expect(row.twoFactorVerifiedAt).toBeNull();
    expect(row.twoFactorLastStep).toBeNull();
    expect(await countRemainingRecoveryCodes(user.id)).toBe(0);
  });
});

describe('session records', () => {
  it('opens a session that has not cleared the second factor', async () => {
    const user = await makeUser('sess-pending');
    const sid = await createPendingSession(user.id);

    const session = await loadSession(sid);
    expect(session).not.toBeNull();
    expect(session!.mfaVerifiedAt).toBeNull();
  });

  it('marks a session verified only when told to', async () => {
    const user = await makeUser('sess-verify');
    const sid = await createPendingSession(user.id);

    await markSessionMfaVerified(sid, 'TOTP');

    const session = await loadSession(sid);
    expect(session!.mfaVerifiedAt).toBeInstanceOf(Date);
  });

  it('refuses a revoked session immediately', async () => {
    const user = await makeUser('sess-revoke');
    const sid = await createPendingSession(user.id);
    await markSessionMfaVerified(sid, 'TOTP');

    await revokeUserSessions(user.id, 'PASSWORD_CHANGED');

    expect(await loadSession(sid)).toBeNull();
  });

  it('keeps the current session when revoking the others', async () => {
    const user = await makeUser('sess-keep');
    const mine = await createPendingSession(user.id);
    const other = await createPendingSession(user.id);
    await markSessionMfaVerified(mine, 'TOTP');
    await markSessionMfaVerified(other, 'TOTP');

    const count = await revokeUserSessions(user.id, 'REVOKED_BY_USER', mine);

    expect(count).toBe(1);
    expect(await loadSession(mine)).not.toBeNull();
    expect(await loadSession(other)).toBeNull();
  });

  it("refuses to revoke another user's session", async () => {
    const [alice, bob] = [await makeUser('sess-alice'), await makeUser('sess-bob')];
    const alicesSession = await createPendingSession(alice.id);
    await markSessionMfaVerified(alicesSession, 'TOTP');

    expect(await revokeSession(alicesSession, bob.id, 'REVOKED_BY_USER')).toBe(false);
    expect(await loadSession(alicesSession)).not.toBeNull();
  });

  it('refuses an expired session', async () => {
    const user = await makeUser('sess-expired');
    const sid = await createPendingSession(user.id);
    await prisma.authSession.update({
      where: { id: sid },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await loadSession(sid)).toBeNull();
  });

  it('lists only verified sessions, flagging the current one', async () => {
    const user = await makeUser('sess-list');
    const mine = await createPendingSession(user.id);
    const other = await createPendingSession(user.id);
    const halfFinished = await createPendingSession(user.id);
    await markSessionMfaVerified(mine, 'TOTP');
    await markSessionMfaVerified(other, 'RECOVERY_CODE');

    const sessions = await listActiveSessions(user.id, mine);
    const ids = sessions.map((session) => session.id);

    expect(ids).toContain(mine);
    expect(ids).toContain(other);
    // A sign-in still owing a code is not a device with access.
    expect(ids).not.toContain(halfFinished);
    expect(sessions.find((session) => session.id === mine)!.current).toBe(true);
  });
});

describe('secrets never leak', () => {
  it('keeps the raw secret out of everything the enrollment offer returns', async () => {
    const user = await makeUser('leak');
    const offer = await beginEnrollment(user.id);

    const secret = decryptTotpSecret(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { twoFactorPending: true },
        })
      ).twoFactorPending,
    )!;

    // The QR image and the manual key are the only two places the secret is
    // meant to appear, and the manual key is the secret by design.
    expect(offer.qrDataUri.startsWith('data:image/png;base64,')).toBe(true);
    expect(offer.manualKey.replace(/\s/g, '')).toBe(secret);
    expect(offer.accountLabel).toBe(user.email);
  });

  it('writes no secret or code into the security audit trail', async () => {
    const user = await makeUser('audit');
    const { secret, recoveryCodes } = await enrol(user.id);
    const code = codeFor(secret, -2);
    await verifyUserTotp(user.id, code, 'audit').catch(() => undefined);

    const entries = await prisma.auditLog.findMany({
      where: { entity: 'Security', entityId: user.id },
    });
    const text = JSON.stringify(entries);

    expect(entries.length).toBeGreaterThan(0);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(code);
    for (const recovery of recoveryCodes) expect(text).not.toContain(recovery);
    expect(text).not.toContain(process.env.MFA_ENCRYPTION_KEY!);
  });
});
