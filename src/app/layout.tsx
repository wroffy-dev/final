import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { prisma } from '@/lib/db/prisma';
import { getSeoSettings, getTrackingSettings, getWebsiteSettings } from '@/lib/services/settings';
import { BrandStyle } from '@/components/public/brand-style';
import { HeadTracking, BodyTracking } from '@/components/analytics/tracking-scripts';
import { ConsentBanner } from '@/components/analytics/consent-banner';
import { ToastProvider } from '@/components/ui/toast';
import { getRequestCountry } from '@/lib/country/request';
import { siteUrl } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const [site, seo] = await Promise.all([getWebsiteSettings(), getSeoSettings()]);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: seo.defaultTitle, template: seo.titleTemplate },
    description: seo.defaultDescription,
    icons: site.faviconUrl ? { icon: site.faviconUrl } : undefined,
    applicationName: site.siteName,
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, tracking, scripts, cookieStore, country] = await Promise.all([
    getWebsiteSettings(),
    getTrackingSettings(),
    prisma.trackingScript.findMany({ where: { isActive: true } }),
    cookies(),
    // The market's own BCP-47 tag, so `<html lang>` agrees with the canonical
    // and the hreflang annotations the page emits. Request-cached, so this
    // shares the resolution the public layout already made.
    getRequestCountry().catch(() => null),
  ]);

  const consentGranted =
    !tracking.consentRequired || cookieStore.get('tracking_consent')?.value === 'granted';
  const consentUndecided = tracking.consentRequired && !cookieStore.get('tracking_consent');

  return (
    <html lang={country?.locale || 'en'} suppressHydrationWarning>
      <head>
        <BrandStyle settings={site} />
        <HeadTracking settings={tracking} scripts={scripts} consentGranted={consentGranted} />
      </head>
      <body>
        <BodyTracking
          settings={tracking}
          scripts={scripts}
          placement="BODY_START"
          consentGranted={consentGranted}
        />
        <ToastProvider>{children}</ToastProvider>
        {consentUndecided ? (
          <ConsentBanner
            message={
              tracking.consentMessage ||
              'We use cookies to understand how the site is used and to improve it. You can decline without losing any functionality.'
            }
          />
        ) : null}
        <BodyTracking
          settings={tracking}
          scripts={scripts}
          placement="BODY_END"
          consentGranted={consentGranted}
        />
      </body>
    </html>
  );
}
