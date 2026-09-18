import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getMfaStatus, type MfaStatus } from '@/lib/mfa/mfa.service';
import { listActiveSessions, type SessionSummary } from '@/lib/auth/session.service';
import { listSecurityEvents, type SecurityEventRow } from '@/lib/security/security-log';
import type { SessionUser } from '@/lib/auth/guards';

/**
 * Everything the My Profile screen renders.
 *
 * Scoped entirely by the session user passed in — the id is never taken from a
 * route parameter or a form field, so there is no version of this call that
 * can read someone else's account.
 */

export type ProfileData = {
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string;
    jobTitle: string;
    department: string;
    timezone: string;
    image: string | null;
    roleName: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
  };
  personal: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    alternatePhone: string;
    bio: string;
  };
  mfa: Omit<MfaStatus, 'configuredAt' | 'lastVerifiedAt'> & {
    configuredAt: string | null;
    lastVerifiedAt: string | null;
  };
  sessions: Array<Omit<SessionSummary, 'createdAt' | 'lastSeenAt' | 'expiresAt'> & {
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
  }>;
  events: Array<Omit<SecurityEventRow, 'createdAt'> & { createdAt: string }>;
};

export async function getMyProfile(user: SessionUser): Promise<ProfileData> {
  const [account, mfa, sessions, events] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        jobTitle: true,
        department: true,
        timezone: true,
        image: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        alternatePhone: true,
        bio: true,
        roles: { select: { name: true } },
      },
    }),
    getMfaStatus(user.id),
    listActiveSessions(user.id, user.sessionId),
    listSecurityEvents(user.id),
  ]);

  return {
    profile: {
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone ?? '',
      jobTitle: account.jobTitle ?? '',
      department: account.department ?? '',
      timezone: account.timezone ?? '',
      image: account.image,
      roleName: account.roles.name,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: account.passwordChangedAt?.toISOString() ?? null,
    },
    personal: {
      addressLine1: account.addressLine1 ?? '',
      addressLine2: account.addressLine2 ?? '',
      city: account.city ?? '',
      state: account.state ?? '',
      country: account.country ?? '',
      postalCode: account.postalCode ?? '',
      alternatePhone: account.alternatePhone ?? '',
      bio: account.bio ?? '',
    },
    mfa: {
      ...mfa,
      configuredAt: mfa.configuredAt?.toISOString() ?? null,
      lastVerifiedAt: mfa.lastVerifiedAt?.toISOString() ?? null,
    },
    sessions: sessions.map((session) => ({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    })),
    events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  };
}
