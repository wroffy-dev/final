import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { AuthorizationError, type SessionUser } from '@/lib/auth/guards';
import { listCountries, listActiveCountries } from './registry';
import type { CountryContext } from './types';

/**
 * Market access for staff.
 *
 * This layer only ever *narrows* what a role already permits — it never grants
 * anything. A user with no `UserCountry` rows works in every market, which is
 * what every account created before markets existed has, so the existing RBAC
 * behaviour is unchanged until somebody deliberately restricts an account.
 */

/** Market ids explicitly assigned to a user. Empty means "every market". */
export const getUserCountryIds = cache(async (userId: string): Promise<string[]> => {
  const rows = await prisma.userCountry.findMany({
    where: { userId },
    select: { countryId: true },
  });
  return rows.map((row) => row.countryId);
});

/**
 * The markets a user may work in.
 *
 * Super admins always see every market: the role exists precisely so somebody
 * can fix a misconfigured restriction.
 */
export async function listAccessibleCountries(
  user: SessionUser,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<CountryContext[]> {
  const all = includeInactive ? await listCountries() : await listActiveCountries();
  if (user.role === 'super-admin') return all;

  const assigned = await getUserCountryIds(user.id);
  if (assigned.length === 0) return all;
  const allowed = new Set(assigned);
  return all.filter((country) => allowed.has(country.id));
}

export async function userCanAccessCountry(user: SessionUser, countryId: string): Promise<boolean> {
  if (user.role === 'super-admin') return true;
  const assigned = await getUserCountryIds(user.id);
  if (assigned.length === 0) return true;
  return assigned.includes(countryId);
}

/**
 * Action-level guard.
 *
 * Every mutation that writes country-scoped content runs this against the
 * country id it is about to use, so a crafted form body cannot make an editor
 * restricted to one market write into another.
 */
export async function assertCountryAccess(user: SessionUser, countryId: string): Promise<void> {
  if (await userCanAccessCountry(user, countryId)) return;
  throw new AuthorizationError(`country:${countryId}`);
}
