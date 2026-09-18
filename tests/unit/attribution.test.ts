import { describe, it, expect } from 'vitest';
import {
  decideAttribution,
  touchFromVisit,
  parseTouch,
  hasCampaign,
  type Touch,
} from '@/lib/analytics/touch';

const AT = new Date('2026-09-10T09:00:00.000Z');

/** A visit arriving on a campaign link. */
function campaignVisit(source: string, medium: string, campaign: string, path = '/pricing'): Touch {
  return touchFromVisit({
    params: { utm_source: source, utm_medium: medium, utm_campaign: campaign },
    externalReferrer: null,
    path,
    at: AT,
  })!;
}

/** A visit arriving from an external link with no campaign tags. */
function referrerVisit(referrer: string, path = '/blog/migration'): Touch {
  return touchFromVisit({ params: {}, externalReferrer: referrer, path, at: AT })!;
}

/** Internal navigation: no tags, no external referrer. */
const internalVisit = () =>
  touchFromVisit({ params: {}, externalReferrer: null, path: '/products', at: AT });

describe('reading a visit', () => {
  it('records a campaign visit', () => {
    const visit = campaignVisit('google', 'cpc', 'dropbox_business');
    expect(visit).toMatchObject({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'dropbox_business',
      landing: '/pricing',
    });
    expect(visit.at).toBe(AT.toISOString());
  });

  it('records an external referrer with no campaign', () => {
    const visit = referrerVisit('https://news.example.com/post');
    expect(hasCampaign(visit)).toBe(false);
    expect(visit.referrer).toBe('https://news.example.com/post');
  });

  it('treats internal navigation as no attribution at all', () => {
    expect(internalVisit()).toBeNull();
  });

  it('bounds every stored value so a crafted URL cannot bloat the cookie', () => {
    const visit = touchFromVisit({
      params: { utm_source: 'x'.repeat(500) },
      externalReferrer: `https://e.example/${'y'.repeat(900)}`,
      path: `/${'z'.repeat(900)}`,
      at: AT,
    })!;
    expect(visit.utm_source!.length).toBe(200);
    expect(visit.referrer!.length).toBe(500);
    expect(visit.landing!.length).toBe(300);
  });
});

describe('first touch', () => {
  it('is captured on the first campaign visit', () => {
    const visit = campaignVisit('google', 'cpc', 'dropbox_business');
    const decision = decideAttribution({ visit, storedFirst: null, storedLast: null });
    expect(decision.writeFirst).toEqual(visit);
    expect(decision.writeLast).toEqual(visit);
  });

  it('is never overwritten, however many later campaigns arrive', () => {
    const first = campaignVisit('google', 'cpc', 'dropbox_business');

    for (const later of [
      campaignVisit('linkedin', 'paid_social', 'remarketing'),
      campaignVisit('newsletter', 'email', 'september'),
      referrerVisit('https://news.example.com/post'),
    ]) {
      const decision = decideAttribution({ visit: later, storedFirst: first, storedLast: first });
      expect(decision.writeFirst).toBeNull();
    }
  });

  it('is captured from a referrer-only visit when that is how they first arrived', () => {
    const visit = referrerVisit('https://duckduckgo.com/');
    const decision = decideAttribution({ visit, storedFirst: null, storedLast: null });
    expect(decision.writeFirst).toEqual(visit);
  });
});

describe('last touch', () => {
  it('updates when a later campaign arrives', () => {
    const first = campaignVisit('google', 'cpc', 'dropbox_business');
    const later = campaignVisit('linkedin', 'paid_social', 'remarketing');

    const decision = decideAttribution({ visit: later, storedFirst: first, storedLast: first });
    expect(decision.writeLast).toEqual(later);
    expect(decision.writeLast!.utm_source).toBe('linkedin');
  });

  it('is not destroyed by a plain external referrer after a campaign', () => {
    // The scenario the brief calls out: arrive on an ad, come back organically.
    const ad = campaignVisit('google', 'cpc', 'dropbox_business');
    const organic = referrerVisit('https://www.google.com/search?q=dropbox');

    const decision = decideAttribution({ visit: organic, storedFirst: ad, storedLast: ad });
    expect(decision.writeLast).toBeNull();
  });

  it('does record a referrer when no campaign is credited yet', () => {
    const referrerOnly = referrerVisit('https://news.example.com/post');
    const previousReferrer = referrerVisit('https://old.example.com/');

    expect(
      decideAttribution({ visit: referrerOnly, storedFirst: null, storedLast: null }).writeLast,
    ).toEqual(referrerOnly);

    // One referrer may replace another — neither is a campaign.
    expect(
      decideAttribution({
        visit: referrerOnly,
        storedFirst: previousReferrer,
        storedLast: previousReferrer,
      }).writeLast,
    ).toEqual(referrerOnly);
  });

  it('survives internal navigation entirely', () => {
    const ad = campaignVisit('google', 'cpc', 'dropbox_business');
    // Landing → product → pricing → form: none of these touch attribution.
    const decision = decideAttribution({
      visit: internalVisit(),
      storedFirst: ad,
      storedLast: ad,
    });
    expect(decision).toEqual({ writeFirst: null, writeLast: null });
  });
});

describe('a full visitor journey', () => {
  it('keeps first and last touch distinct across several sessions', () => {
    let first: Touch | null = null;
    let last: Touch | null = null;

    const apply = (visit: Touch | null) => {
      const decision = decideAttribution({ visit, storedFirst: first, storedLast: last });
      if (decision.writeFirst) first = decision.writeFirst;
      if (decision.writeLast) last = decision.writeLast;
    };

    // Session 1: found through a Google ad, browses around.
    apply(campaignVisit('google', 'cpc', 'dropbox_business', '/'));
    apply(internalVisit());
    apply(internalVisit());

    // Session 2: comes back via an organic search — must not clear the ad.
    apply(referrerVisit('https://www.google.com/search?q=dropbox'));

    // Session 3: clicks a LinkedIn remarketing ad, then navigates to the form.
    apply(campaignVisit('linkedin', 'paid_social', 'remarketing', '/contact'));
    apply(internalVisit());

    expect(first).toMatchObject({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'dropbox_business',
    });
    expect(last).toMatchObject({
      utm_source: 'linkedin',
      utm_medium: 'paid_social',
      utm_campaign: 'remarketing',
    });
  });

  it('leaves a purely direct visitor with no attribution rather than a fabricated one', () => {
    const decision = decideAttribution({
      visit: internalVisit(),
      storedFirst: null,
      storedLast: null,
    });
    expect(decision).toEqual({ writeFirst: null, writeLast: null });
  });
});

describe('reading stored cookies', () => {
  it('round-trips a stored touch', () => {
    const visit = campaignVisit('google', 'cpc', 'dropbox_business');
    expect(parseTouch(encodeURIComponent(JSON.stringify(visit)))).toEqual(visit);
  });

  it('treats a corrupt or hostile cookie as absent rather than throwing', () => {
    for (const junk of [null, undefined, '', 'not-json', '%%%', '"a string"', '[1,2,3]']) {
      expect(parseTouch(junk)).toBeNull();
    }
  });

  it('replaces an unreadable last touch instead of preserving it forever', () => {
    const visit = referrerVisit('https://news.example.com/post');
    const decision = decideAttribution({
      visit,
      storedFirst: null,
      storedLast: parseTouch('junk'),
    });
    expect(decision.writeLast).toEqual(visit);
  });
});
