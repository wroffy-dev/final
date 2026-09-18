import { NextResponse } from 'next/server';
import { getSeoSettings } from '@/lib/services/settings';
import { listCountries } from '@/lib/country/registry';
import { prisma } from '@/lib/db/prisma';
import { compileRobots, type CountryRobots } from '@/lib/seo/robots';
import { siteUrl } from '@/lib/env';

/**
 * The host's robots.txt.
 *
 * A route handler rather than Next's `robots.ts` export, so the admin preview
 * and the served file come from one function — a preview generated a second
 * way would eventually disagree with what crawlers get, which is the worst
 * kind of disagreement to debug.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = siteUrl().replace(/\/$/, '');

  const [seo, countries, settings] = await Promise.all([
    getSeoSettings().catch(() => null),
    listCountries().catch(() => []),
    prisma.countrySettings
      .findMany({
        select: {
          countryId: true,
          robotsDisallow: true,
          robotsAllow: true,
          noIndexCountry: true,
          excludeFromSitemap: true,
        },
      })
      .catch(() => []),
  ]);

  const byCountry = new Map(settings.map((row) => [row.countryId, row]));
  const rows: CountryRobots[] = countries.map((country) => {
    const row = byCountry.get(country.id);
    return {
      slug: country.slug,
      name: country.name,
      isActive: country.isActive,
      isPublished: country.isPublished,
      disallow: row?.robotsDisallow ?? null,
      allow: row?.robotsAllow ?? null,
      noIndexCountry: row?.noIndexCountry ?? false,
      excludeFromSitemap: row?.excludeFromSitemap ?? false,
    };
  });

  const { body } = compileRobots({
    baseUrl: base,
    noIndexSite: seo?.noIndexSite ?? false,
    sitemapEnabled: seo?.sitemapEnabled !== false,
    extra: seo?.robotsTxtExtra ?? null,
    countries: rows,
  });

  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
