import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getCurrentUser, type SessionUser } from '@/lib/auth/guards';
import { getDefaultCountry } from './registry';
import { listAccessibleCountries } from './access';
import type { CountryContext } from './types';

/**
 * Which market the admin is currently editing.
 *
 * The choice is stored in a cookie rather than in the URL of every screen, so
 * no existing admin route had to change shape, and it is resolved on the server
 * and handed to the client as a prop — the selector never reads the cookie
 * itself, so there is nothing for hydration to disagree about.
 *
 * The cookie is a hint, never an authority: the resolved market is always
 * re-validated against the markets the signed-in user may actually work in.
 */

export const ADMIN_COUNTRY_COOKIE = 'admin_country';

export type AdminCountryScope = {
  /** The market the admin is working in. */
  country: CountryContext;
  /** Every market this user may switch to. */
  countries: CountryContext[];
  /** True when the user may see more than one market. */
  canSwitch: boolean;
};

export const getAdminCountryScope = cache(async (): Promise<AdminCountryScope> => {
  const user = await getCurrentUser();
  if (!user) {
    const fallback = await getDefaultCountry();
    return { country: fallback, countries: [fallback], canSwitch: false };
  }
  return scopeForUser(user);
});

/**
 * The admin's stored preference, or none where there is no request to read it
 * from.
 *
 * `cookies()` throws outside a request scope — a background job, a script, a
 * test calling an action directly. A missing preference simply means "the
 * default market", which is what an admin who has never switched also gets, so
 * this degrades rather than throwing.
 */
async function preferredCountryCode(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(ADMIN_COUNTRY_COOKIE)?.value?.trim().toUpperCase() ?? null;
  } catch {
    return null;
  }
}

/** The same resolution for a caller that already holds the user (Server Actions). */
export async function scopeForUser(user: SessionUser): Promise<AdminCountryScope> {
  const [countries, fallback, preferred] = await Promise.all([
    listAccessibleCountries(user),
    getDefaultCountry(),
    preferredCountryCode(),
  ]);

  const available = countries.length > 0 ? countries : [fallback];

  const country =
    available.find((candidate) => candidate.code === preferred) ??
    available.find((candidate) => candidate.id === fallback.id) ??
    available[0] ??
    fallback;

  return { country, countries: available, canSwitch: available.length > 1 };
}

/** The admin's current market, for screens that only need the one value. */
export async function getAdminCountry(): Promise<CountryContext> {
  const scope = await getAdminCountryScope();
  return scope.country;
}

/**
 * Resolves the market a Server Action should write to.
 *
 * A request may name a market explicitly (the page editor sends the market its
 * record belongs to); otherwise the admin's current selection is used. Either
 * way the result is validated against the user's access before it is returned,
 * which is what stops an id in a form body reaching a market the user cannot
 * edit.
 */
export async function resolveActionCountry(
  user: SessionUser,
  requestedId?: string | null,
): Promise<CountryContext> {
  const scope = await scopeForUser(user);
  if (requestedId) {
    const match = scope.countries.find((candidate) => candidate.id === requestedId);
    if (!match) {
      const { AuthorizationError } = await import('@/lib/auth/guards');
      throw new AuthorizationError(`country:${requestedId}`);
    }
    return match;
  }
  return scope.country;
}
