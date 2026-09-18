import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { getPageForPreview } from '@/lib/services/pages';
import { getWebsiteSettings } from '@/lib/services/settings';
import { getNavigations, getPrimaryNavigation } from '@/lib/services/navigation';
import { getCountryById, getDefaultCountry } from '@/lib/country/registry';
import { getCountrySettings } from '@/lib/country/settings';
import { countryPath, countryHref } from '@/lib/country/routing';
import { SectionList } from '@/components/cms/section-renderer';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The page body shown inside the preview iframe.
 *
 * It lives outside /admin so it inherits only the root layout — no admin
 * sidebar inside the frame — and renders through the same SectionList and site
 * chrome as the public route, making a preview a true representation rather
 * than an approximation.
 *
 * Draft content is visible here and nowhere else: the public route still
 * applies the publish gate, middleware requires a session for /preview, and
 * robots.txt disallows it.
 */
export default async function PreviewRender({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('pages.view');
  const { id } = await params;

  const page = await getPageForPreview(id);
  if (!page) notFound();

  // The preview renders in the market the page belongs to, so its menus,
  // contact details and internal links are the ones a visitor would see.
  const country = (await getCountryById(page.countryId)) ?? (await getDefaultCountry());

  const [site, local, nav, footerMenus, legalMenus] = await Promise.all([
    getWebsiteSettings(),
    getCountrySettings(country),
    getPrimaryNavigation(country),
    getNavigations(country, 'FOOTER'),
    getNavigations(country, 'LEGAL'),
  ]);

  return (
    <>
      {page.showHeader ? (
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
                ? {
                    text: site.announcementText,
                    url: countryHref(country, site.announcementUrl),
                  }
                : null,
          }}
        />
      ) : null}

      <main>
        <SectionList sections={page.sections} country={country} />
      </main>

      {page.showFooter ? (
        <SiteFooter
          settings={site}
          local={local}
          homeUrl={countryPath(country)}
          columns={footerMenus}
          legal={legalMenus[0]?.items ?? []}
        />
      ) : null}
    </>
  );
}
