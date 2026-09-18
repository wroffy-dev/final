import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type { Country } from '@prisma/client';
import type { CountryContext } from './types';
import { splitCountryPath } from './routing';

/**
 * The configured markets.
 *
 * Two layers of caching, for two different reasons:
 *
 *  - `cache()` dedupes within a single request, so a page that resolves the
 *    market, renders a market-aware header and emits hreflang still makes one
 *    query, not three;
 *  - a small in-process TTL keeps that one query off the hot path entirely.
 *    Market rows change a handful of times in a site's life, so a 60-second
 *    window costs nothing and every mutation busts it immediately via
 *    `invalidateCountryCache()`.
 */

const CACHE_TTL_MS = 60_000;

let cachedRows: Country[] | null = null;
let cachedAt = 0;

/** Called by every mutation that touches the Country table. */
export function invalidateCountryCache(): void {
  cachedRows = null;
  cachedAt = 0;
}

/**
 * What the site falls back to before the first market row exists.
 *
 * Only reachable on a database that has not run the multi-country migration or
 * the seed. It keeps the public site rendering instead of throwing, and its id
 * matches the row the migration creates, so nothing written against it lands in
 * the wrong place once the row appears.
 */
const FALLBACK_COUNTRY: CountryContext = {
  id: 'country_in',
  name: 'India',
  code: 'IN',
  slug: '',
  locale: 'en-IN',
  currency: 'INR',
  currencySymbol: '₹',
  phoneCode: '+91',
  timezone: 'Asia/Kolkata',
  isDefault: true,
  isActive: true,
  isPublished: true,
  sortOrder: 0,
  prefixes: [],
};

async function loadRows(): Promise<Country[]> {
  const now = Date.now();
  if (cachedRows && now - cachedAt < CACHE_TTL_MS) return cachedRows;
  try {
    const rows = await prisma.country.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    cachedRows = rows;
    cachedAt = now;
    return rows;
  } catch (error) {
    // A transient database problem must not take the public site down with it.
    if (cachedRows) return cachedRows;
    console.error('[country] failed to load markets', error);
    return [];
  }
}

function toContext(row: Country, prefixes: readonly string[]): CountryContext {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    slug: row.slug,
    locale: row.locale,
    currency: row.currency,
    currencySymbol: row.currencySymbol,
    phoneCode: row.phoneCode,
    timezone: row.timezone,
    isDefault: row.isDefault,
    isActive: row.isActive,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
    prefixes,
  };
}

/** Every configured market, active or not, in admin order. */
export const listCountries = cache(async (): Promise<CountryContext[]> => {
  const rows = await loadRows();
  if (rows.length === 0) return [FALLBACK_COUNTRY];
  const prefixes = rows.map((row) => row.slug).filter((slug) => slug !== '');
  return rows.map((row) => toContext(row, prefixes));
});

/** Markets that currently serve public traffic. */
export const listActiveCountries = cache(async (): Promise<CountryContext[]> => {
  const all = await listCountries();
  return all.filter((country) => country.isActive);
});

/**
 * Markets that belong in a sitemap.
 *
 * Active *and* published. An active but unpublished market still answers
 * requests — that is the point of building one in the open — but listing it
 * for crawlers would be announcing it.
 */
export const listIndexableCountries = cache(async (): Promise<CountryContext[]> => {
  const all = await listCountries();
  return all.filter((country) => country.isActive && country.isPublished);
});

/**
 * The root market — the one served from `/`.
 *
 * Falls back to the first active market, then to the built-in default, so this
 * never returns null and no caller has to handle a site with no markets.
 */
export const getDefaultCountry = cache(async (): Promise<CountryContext> => {
  const all = await listCountries();
  return (
    all.find((country) => country.isDefault) ??
    all.find((country) => country.isActive) ??
    all[0] ??
    FALLBACK_COUNTRY
  );
});

export const getCountryById = cache(async (id: string | null | undefined): Promise<CountryContext | null> => {
  if (!id) return null;
  const all = await listCountries();
  return all.find((country) => country.id === id) ?? null;
});

export const getCountryByCode = cache(async (code: string | null | undefined): Promise<CountryContext | null> => {
  if (!code) return null;
  const wanted = code.trim().toUpperCase();
  const all = await listCountries();
  return all.find((country) => country.code === wanted) ?? null;
});

export const getCountryBySlug = cache(async (slug: string): Promise<CountryContext | null> => {
  const wanted = slug.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  const all = await listCountries();
  return all.find((country) => country.slug === wanted) ?? null;
});

/**
 * Resolves a public pathname to the market that owns it and the path within
 * that market.
 *
 * `/dropbox-business` → default market, `/dropbox-business`
 * `/ae/dropbox-business` → UAE, `/dropbox-business`
 * `/ae` → UAE, `/`
 * `/qa/...` with Qatar inactive → default market, `/qa/...` (and a 404)
 */
export async function resolveCountryPath(
  pathname: string,
): Promise<{ country: CountryContext; path: string; matchedPrefix: boolean }> {
  const all = await listCountries();
  const result = splitCountryPath(pathname, all);
  return {
    country: result.country ?? (await getDefaultCountry()),
    path: result.path,
    matchedPrefix: result.matchedPrefix,
  };
}

/**
 * Validates a market id supplied by a client.
 *
 * Server Actions never trust a country id from a form body: it has to name a
 * market that exists and is active before anything is written against it.
 */
export async function requireActiveCountry(id: string | null | undefined): Promise<CountryContext> {
  const country = await getCountryById(id);
  if (!country) throw new Error('Unknown country.');
  if (!country.isActive) throw new Error('That country is not active.');
  return country;
}
