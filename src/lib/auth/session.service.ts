import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { hashIp } from '@/lib/utils/crypto';
import { requestContext } from '@/lib/utils/request';

/**
 * Server-side session records.
 *
 * Auth.js issues a JWT, which cannot be revoked on its own. The token carries
 * nothing but the id of a row here; the row decides whether the request is
 * allowed. Everything that needs to end a session — a password change, an
 * administrator resetting someone's authenticator, a user signing other
 * devices out — works by writing to this table, and takes effect on the very
 * next request rather than whenever the token happens to expire.
 */

/** Matches the JWT maxAge in authConfig, so neither outlives the other. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type SessionRevocationReason =
  | 'PASSWORD_CHANGED'
  | 'EMAIL_CHANGED'
  | 'MFA_RESET'
  | 'MFA_RESET_BY_ADMIN'
  | 'REVOKED_BY_USER'
  | 'REVOKED_BY_ADMIN'
  | 'ACCOUNT_DISABLED';

/**
 * Opens a session that has passed the password check but not the second
 * factor. It grants nothing until `markSessionMfaVerified` is called.
 */
export async function createPendingSession(userId: string): Promise<string> {
  const { ip, userAgent } = await requestContext().catch(() => ({
    ip: null,
    ipStatus: 'UNAVAILABLE' as const,
    userAgent: null,
  }));

  const session = await prisma.authSession.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ipHash: hashIp(ip),
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
    select: { id: true },
  });

  // Housekeeping, not security: expired rows are already refused on read.
  void prisma.authSession
    .deleteMany({ where: { userId, expiresAt: { lt: new Date(Date.now() - 7 * 864e5) } } })
    .catch(() => undefined);

  return session.id;
}

/** Promotes a pending session to a full one. Called only after a verified code. */
export async function markSessionMfaVerified(
  sessionId: string,
  method: 'TOTP' | 'RECOVERY_CODE' | 'SETUP',
): Promise<void> {
  await prisma.authSession.update({
    where: { id: sessionId },
    data: { mfaVerifiedAt: new Date(), mfaMethod: method, lastSeenAt: new Date() },
  });
}

export type LiveSession = {
  id: string;
  userId: string;
  mfaVerifiedAt: Date | null;
  expiresAt: Date;
};

/**
 * Reads a session, refusing anything revoked or expired.
 *
 * Returns null rather than throwing so a stale cookie simply signs the user
 * out instead of producing an error page.
 */
export async function loadSession(sessionId: string): Promise<LiveSession | null> {
  if (!sessionId) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, mfaVerifiedAt: true, expiresAt: true, revokedAt: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return session;
}

/**
 * Records activity, at most once a minute.
 *
 * Throttled because this runs on every authenticated request and the Activity
 * tab does not need second-level precision — an unthrottled write would add a
 * row lock to every page load for no benefit.
 */
const lastSeenWrites = new Map<string, number>();

export async function touchSession(sessionId: string): Promise<void> {
  const now = Date.now();
  const previous = lastSeenWrites.get(sessionId) ?? 0;
  if (now - previous < 60_000) return;
  lastSeenWrites.set(sessionId, now);

  if (lastSeenWrites.size > 5000) lastSeenWrites.clear();

  await prisma.authSession
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date(now) } })
    .catch(() => undefined);
}

/** Ends every session for a user except, optionally, the one in hand. */
export async function revokeUserSessions(
  userId: string,
  reason: SessionRevocationReason,
  keepSessionId?: string | null,
): Promise<number> {
  const result = await prisma.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function revokeSession(
  sessionId: string,
  userId: string,
  reason: SessionRevocationReason,
): Promise<boolean> {
  // Scoped by userId as well as id: a guessed session id from another account
  // must not be revocable.
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count > 0;
}

export type SessionSummary = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ipHash: string | null;
  mfaMethod: string | null;
  current: boolean;
};

export async function listActiveSessions(
  userId: string,
  currentSessionId: string | null,
): Promise<SessionSummary[]> {
  const rows = await prisma.authSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      // Pending sessions are half-finished sign-ins, not devices with access.
      mfaVerifiedAt: { not: null },
    },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      userAgent: true,
      ipHash: true,
      mfaMethod: true,
    },
  });

  return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
}
