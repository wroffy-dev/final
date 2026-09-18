import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { getPublishedPage, findRedirect, findPublishedPageCountries } from '@/lib/services/pages';
import { getWebsiteSettings } from '@/lib/services/settings';
import { SectionList } from '@/components/cms/section-renderer';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata } from '@/lib/seo/metadata';
import { countryBreadcrumbSchema, faqSchema } from '@/lib/seo/structured-data';
import { parseBlockContent, type FaqContent } from '@/lib/cms/blocks';
import { countryPath } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';

/**
 * A CMS page, in one market.
 *
 * Both entry points — the root market's catch-all and a prefixed market's —
 * render through here, so there is exactly one implementation of "what is a CMS
 * page" and no chance of the two drifting apart.
 */

export async function cmsPageMetadata(
  country: CountryContext,
  slug: string,
): Promise<Metadata> {
  const page = await getPublishedPage(country.id, slug);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: false } };

  const [ogImage, twitterImage, alternates] = await Promise.all([
    page.ogImageId
      ? prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } })
      : null,
    page.twitterImageId
      ? prisma.media.findUnique({ where: { id: page.twitterImageId }, select: { url: true } })
      : null,
    findPublishedPageCountries(slug),
  ]);

  return buildMetadata({
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    path: `/${slug}`,
    country,
    alternateCountryIds: alternates,
    canonicalUrl: page.canonicalUrl,
    noIndex: page.noIndex,
    noFollow: page.noFollow,
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
    ogImageUrl: ogImage?.url ?? null,
    twitterTitle: page.twitterTitle,
    twitterDescription: page.twitterDescription,
    twitterImageUrl: twitterImage?.url ?? null,
  });
}

export async function CmsPageSurface({
  country,
  slug,
}: {
  country: CountryContext;
  slug: string;
}) {
  const page = await getPublishedPage(country.id, slug);

  if (!page) {
    /*
     * A redirect is looked up for the full request path first and the
     * market-relative path second, so a market can own a redirect outright
     * while a redirect written once still applies wherever it is asked for.
     * A missing page in one market never falls back to another market's
     * content — that would serve the wrong prices to the wrong customers.
     */
    const target = await findRedirect(countryPath(country, slug), `/${slug}`);
    if (target) {
      if (target.permanent) permanentRedirect(target.destination);
      redirect(target.destination);
    }
    notFound();
  }

  const site = await getWebsiteSettings();

  // FAQ structured data is derived from any FAQ sections on the page.
  const faqItems = page.sections
    .filter((s) => s.blockType === 'faq' && s.isVisible)
    .flatMap((s) => parseBlockContent<FaqContent>('faq', s.content).items);
  const faq = faqSchema(faqItems);

  const crumbs =
    slug === ''
      ? null
      : countryBreadcrumbSchema(country, [
          { name: site.siteName, path: '' },
          { name: page.title, path: slug },
        ]);

  return (
    <>
      <SectionList sections={page.sections} country={country} />
      {faq ? <JsonLd data={faq} /> : null}
      {crumbs ? <JsonLd data={crumbs} /> : null}
    </>
  );
}
