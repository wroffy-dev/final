import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { getPostForPreview } from '@/lib/services/blog';
import { getWebsiteSettings } from '@/lib/services/settings';
import { getNavigations, getPrimaryNavigation } from '@/lib/services/navigation';
import { getCountryById, getDefaultCountry } from '@/lib/country/registry';
import { getCountrySettings } from '@/lib/country/settings';
import { countryPath, countryHref } from '@/lib/country/routing';
import { BlogArticle } from '@/components/blog/blog-article';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: 'Blog preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The article body shown inside the blog preview iframe.
 *
 * It renders through the same `BlogArticle` component and the same site chrome
 * as the public route, so a preview is a true representation of the published
 * page rather than an approximation of it.
 *
 * Draft content is visible here and nowhere else: the public route still
 * applies the publish gate, middleware requires a session for /preview, and
 * robots.txt disallows it.
 */
export default async function BlogPreviewRender({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('blog.view');
  const { id } = await params;

  const post = await getPostForPreview(id);
  if (!post) notFound();

  // The preview renders in the market the article belongs to.
  const country = (await getCountryById(post.countryId)) ?? (await getDefaultCountry());

  const [site, local, nav, footerMenus, legalMenus] = await Promise.all([
    getWebsiteSettings(),
    getCountrySettings(country),
    getPrimaryNavigation(country),
    getNavigations(country, 'FOOTER'),
    getNavigations(country, 'LEGAL'),
  ]);

  return (
    <>
      <SiteHeader
        nav={nav}
        brand={{
          siteName: site.siteName,
          logoUrl: site.logoUrl,
          homeUrl: countryPath(country),
          ctaLabel: local.headerCtaLabel,
          ctaUrl: countryHref(country, local.headerCtaUrl),
          secondaryCtaLabel: site.headerSecondaryCtaLabel,
          secondaryCtaUrl: countryHref(country, site.headerSecondaryCtaUrl),
          announcement:
            site.announcementEnabled && site.announcementText
              ? { text: site.announcementText, url: countryHref(country, site.announcementUrl) }
              : null,
        }}
      />

      <main>
        <BlogArticle post={post} country={country} />
      </main>

      <SiteFooter
        settings={site}
        local={local}
        homeUrl={countryPath(country)}
        columns={footerMenus}
        legal={legalMenus[0]?.items ?? []}
      />
    </>
  );
}
