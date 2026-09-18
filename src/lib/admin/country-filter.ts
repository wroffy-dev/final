import 'server-only';
import type { SessionUser } from '@/lib/auth/guards';
import { listAccessibleCountries } from '@/lib/country/access';
import { scopeForUser } from '@/lib/country/admin';
import type { FilterDefinition } from '@/lib/admin/filters';
import type { CountryContext } from '@/lib/country/types';

/**
 * The country filter shared by every market-scoped admin list.
 *
 * An admin list shows the market chosen in the topbar by default, so an editor
 * is never looking at another market's content by accident. A list may also be
 * asked for "All countries" through `?country=all`, which is what the lead
 * dashboard and the page list need when somebody is reviewing the whole
 * business rather than working in one market.
 *
 * The resolved market is always one the user actually has access to: an id in
 * the query string is validated, never trusted.
 */

export const ALL_COUNTRIES = 'all';

export type ListCountryScope = {
  /** The market to filter by, or null when the list spans every market. */
  countryId: string | null;
  /** The market an editor's new records would belong to. */
  current: CountryContext;
  /** Every market this user may see. */
  countries: CountryContext[];
  /** True when more than one market exists for this user. */
  multiCountry: boolean;
  /** The value to echo back into links and the filter bar. */
  value: string;
};

export async function resolveListCountry(
  user: SessionUser,
  requested?: string,
): Promise<ListCountryScope> {
  const [scope, countries] = await Promise.all([
    scopeForUser(user),
    listAccessibleCountries(user, { includeInactive: true }),
  ]);

  const multiCountry = countries.length > 1;
  const wanted = requested?.trim();

  if (multiCountry && wanted === ALL_COUNTRIES) {
    return {
      countryId: null,
      current: scope.country,
      countries,
      multiCountry,
      value: ALL_COUNTRIES,
    };
  }

  const chosen = wanted ? countries.find((country) => country.id === wanted) : undefined;
  const current = chosen ?? scope.country;

  return {
    countryId: current.id,
    current,
    countries,
    multiCountry,
    value: current.id,
  };
}

/**
 * The filter-bar definition for a market-scoped list.
 *
 * Returns nothing when there is only one market, so a single-country
 * installation's admin looks exactly as it did before markets existed.
 */
export function countryFilterDefinition(
  scope: ListCountryScope,
  options: { allowAll?: boolean; label?: string } = {},
): FilterDefinition[] {
  if (!scope.multiCountry) return [];
  return [
    {
      name: 'country',
      label: options.label ?? 'Country',
      allLabel: scope.current.name,
      options: [
        ...(options.allowAll !== false ? [{ label: 'All countries', value: ALL_COUNTRIES }] : []),
        ...scope.countries.map((country) => ({
          label: country.isActive ? country.name : `${country.name} (inactive)`,
          value: country.id,
        })),
      ],
    },
  ];
}
