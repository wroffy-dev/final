import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import type { CountryContext, CountrySettingsView } from './types';

/**
 * Market settings, merged over the global ones.
 *
 * The split is deliberate: brand identity (logo, fonts, colours, layout) is one
 * thing across every market and stays in `WebsiteSettings`; the company name,
 * phone number, address, tax details and organisation schema are not, and live
 * per market. Every country field is optional, and an empty one falls through
 * to the global value — so a market nobody has configured yet renders exactly
 * what the single-country site rendered.
 */

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getCountrySettings = cache(
  async (country: CountryContext): Promise<CountrySettingsView> => {
    const [row, site, seo] = await Promise.all([
      prisma.countrySettings.findUnique({ where: { countryId: country.id } }).catch(() => null),
      getWebsiteSettings(),
      getSeoSettings(),
    ]);

    return {
      countryId: country.id,
      companyName: clean(row?.companyName) ?? site.siteName,
      legalName: clean(row?.legalName),
      salesPhone: clean(row?.salesPhone) ?? clean(site.contactPhone),
      supportPhone: clean(row?.supportPhone),
      whatsappNumber: clean(row?.whatsappNumber) ?? clean(site.whatsappNumber),
      salesEmail: clean(row?.salesEmail) ?? clean(site.contactEmail),
      supportEmail: clean(row?.supportEmail),
      addressLine1: clean(row?.addressLine1),
      addressLine2: clean(row?.addressLine2),
      city: clean(row?.city),
      region: clean(row?.region),
      postalCode: clean(row?.postalCode),
      address: clean(row?.address) ?? clean(site.address),
      businessHours: clean(row?.businessHours),
      taxLabel: clean(row?.taxLabel),
      taxNumber: clean(row?.taxNumber),
      headerCtaLabel: clean(row?.headerCtaLabel) ?? clean(site.headerCtaLabel),
      headerCtaUrl: clean(row?.headerCtaUrl) ?? clean(site.headerCtaUrl),
      salesCtaText: clean(row?.salesCtaText),
      footerDescription: clean(row?.footerDescription) ?? clean(site.footerDescription),
      copyrightText: clean(row?.copyrightText) ?? clean(site.copyrightText),
      noIndexCountry: row?.noIndexCountry ?? false,
      defaultTitle: clean(row?.defaultTitle) ?? seo.defaultTitle,
      titleTemplate: clean(row?.titleTemplate) ?? seo.titleTemplate,
      defaultDescription: clean(row?.defaultDescription) ?? seo.defaultDescription,
      defaultOgImageUrl: clean(row?.defaultOgImageUrl) ?? clean(seo.defaultOgImageUrl),
      organizationName: clean(row?.organizationName) ?? (seo.organizationName || site.siteName),
      organizationType: clean(row?.organizationType) ?? (seo.organizationType || 'Organization'),
      organizationLogoUrl: clean(row?.organizationLogoUrl) ?? clean(seo.organizationLogoUrl),
      localBusinessType: clean(row?.localBusinessType),
      latitude: clean(row?.latitude),
      longitude: clean(row?.longitude),
    };
  },
);

/** The raw row for the settings editor, or null when a market has never been configured. */
export async function getCountrySettingsRow(countryId: string) {
  return prisma.countrySettings.findUnique({ where: { countryId } });
}
