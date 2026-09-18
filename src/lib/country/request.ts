import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import type { CountryContext } from './types';
import { resolveCountryPath } from './registry';
import { countryPath } from './routing';

/**
 * The market the current public request belongs to.
 *
 * Middleware already forwards the request path as `x-pathname` (it did so
 * before markets existed, for the header/footer flags), so resolution needs no
 * new plumbing and no rewrite: the prefix stays in the URL, which is what keeps
 * client navigation, canonical URLs and the browser address bar honest.
 *
 * `cache()` makes this one resolution per request no matter how many layouts,
 * pages and components ask for it.
 */
/**
 * The request path, or `/` where there is no request to read.
 *
 * `headers()` throws outside a request scope — a background job, a script, a
 * test exercising an action directly. There is no market prefix in any of those
 * cases, so the root market is not a guess but the only correct answer, and
 * degrading to it is better than making every caller handle a throw.
 */
async function requestPath(): Promise<string> {
  try {
    const headerList = await headers();
    return headerList.get('x-pathname') ?? '/';
  } catch {
    return '/';
  }
}

export const getRequestCountry = cache(async (): Promise<CountryContext> => {
  const { country } = await resolveCountryPath(await requestPath());
  return country;
});

/** The current request's path with its market prefix stripped. */
export const getRequestCountryPath = cache(async (): Promise<string> => {
  const { path } = await resolveCountryPath(await requestPath());
  return path;
});

/** Convenience: an absolute-in-site link for the requesting market. */
export async function currentCountryPath(path = ''): Promise<string> {
  const country = await getRequestCountry();
  return countryPath(country, path);
}
