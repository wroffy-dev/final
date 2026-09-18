import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { hashIp } from '@/lib/utils/crypto';
import { requestContext } from '@/lib/utils/request';

/**
 * Security events, written to the existing AuditLog table.
 *
 * A separate table was not needed: AuditLog already carries actor, entity, IP
 * hash, user agent and timestamp, and keeping security events alongside every
 * other change means one place to look when investigating an incident. The
 * `entity` is always "Security", which is what the Activity tab filters on.
 *
 * Nothing that reaches this function may contain a password, a TOTP code, a
 * TOTP secret, a recovery code or an encryption key. Call sites pass a summary
 * they have written by hand, never a raw input or a caught error.
 */

export const SECURITY_ENTITY = 'Security';

export type SecurityAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'MFA_LOGIN_VERIFIED'
  | 'MFA_VERIFICATION_FAILED'
  | 'MFA_SETUP_STARTED'
  | 'MFA_ENABLED'
  | 'MFA_RESET_BY_USER'
  | 'MFA_RESET_BY_ADMIN'
  | 'RECOVERY_CODE_USED'
  | 'RECOVERY_CODES_REGENERATED'
  | 'PASSWORD_CHANGED'
  | 'EMAIL_CHANGED'
  | 'PROFILE_UPDATED'
  | 'OTHER_SESSIONS_REVOKED'
  | 'SESSION_REVOKED';

export type SecurityEvent = {
  /** Whose account the event concerns. */
  userId: string;
  userEmail?: string | null;
  action: SecurityAction;
  /** Written by the call site. Never interpolate user input or an error. */
  summary: string;
  /** Set when an administrator acted on someone else's account. */
  actorId?: string | null;
  actorEmail?: string | null;
};

/** Never throws: failing to log must not fail the security action itself. */
export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext().catch(() => ({
      ip: null,
      ipStatus: 'UNAVAILABLE' as const,
      userAgent: null,
    }));

    await prisma.auditLog.create({
      data: {
        // The actor is whoever performed the action — the account owner
        // normally, an administrator during an assisted reset.
        actorId: event.actorId ?? event.userId,
        actorEmail: event.actorEmail ?? event.userEmail ?? null,
        action: event.action,
        entity: SECURITY_ENTITY,
        entityId: event.userId,
        summary: event.summary,
        ipHash: hashIp(ip),
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error('[security-log] failed to record', (error as Error)?.name ?? 'error');
  }
}

export type SecurityEventRow = {
  id: string;
  action: string;
  summary: string | null;
  createdAt: Date;
  actorEmail: string | null;
  userAgent: string | null;
};

/**
 * The signed-in user's own events.
 *
 * Scoped by `entityId`, which is the account the event is about — so an
 * administrator's reset of this account appears here, and this user never sees
 * anyone else's activity.
 */
export async function listSecurityEvents(userId: string, take = 25): Promise<SecurityEventRow[]> {
  return prisma.auditLog.findMany({
    where: { entity: SECURITY_ENTITY, entityId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      action: true,
      summary: true,
      createdAt: true,
      actorEmail: true,
      userAgent: true,
    },
  });
}
