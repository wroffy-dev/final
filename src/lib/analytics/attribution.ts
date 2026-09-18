'use client';

import type { Attribution } from '@/lib/validation/form-submission';

const FIRST_COOKIE = 'attr_first';
const LAST_COOKIE = 'attr_last';

type Touch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing?: string;
  at?: string;
};

function readCookie(name: string): Touch | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.slice(name.length + 1))) as Touch;
  } catch {
    return null;
  }
}

/**
 * Reads the attribution cookies written by middleware and merges in any UTM
 * parameters present on the current URL. Returns first-touch and last-touch.
 */
export function collectAttribution(extra?: {
  ctaLabel?: string;
  ctaLocation?: string;
}): Attribution {
  const first = readCookie(FIRST_COOKIE);
  const last = readCookie(LAST_COOKIE);

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const fromUrl = (key: string) => params?.get(key) ?? undefined;

  return {
    utmSource: fromUrl('utm_source') ?? last?.utm_source ?? null,
    utmMedium: fromUrl('utm_medium') ?? last?.utm_medium ?? null,
    utmCampaign: fromUrl('utm_campaign') ?? last?.utm_campaign ?? null,
    utmTerm: fromUrl('utm_term') ?? last?.utm_term ?? null,
    utmContent: fromUrl('utm_content') ?? last?.utm_content ?? null,

    firstUtmSource: first?.utm_source ?? null,
    firstUtmMedium: first?.utm_medium ?? null,
    firstUtmCampaign: first?.utm_campaign ?? null,
    firstUtmTerm: first?.utm_term ?? null,
    firstUtmContent: first?.utm_content ?? null,
    firstLandingUrl: first?.landing ?? null,
    firstTouchAt: first?.at ?? null,

    referrer: last?.referrer ?? (typeof document !== 'undefined' ? document.referrer || null : null),
    landingUrl: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    pagePath: typeof window !== 'undefined' ? window.location.pathname : null,
    ctaLabel: extra?.ctaLabel ?? null,
    ctaLocation: extra?.ctaLocation ?? null,
  };
}

/** Pushes a conversion event into dataLayer when GTM/GA4 is active. */
export function trackConversion(event: string, data: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  const w = window as typeof window & { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ event, ...data });
}
