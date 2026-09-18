import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');
const { getSourcePerformance, getCampaignPerformance, getCrmKpis } =
  await import('@/lib/services/crm-dashboard');
const { resolveRange } = await import('@/lib/admin/date-range');

const suffix = uniqueSuffix();
const slug = `utm-form-${suffix}`;
let formId = '';

function payload(email: string, attribution: Record<string, unknown>) {
  return {
    /*
     * Every form now asks for consent, so a submission that omits it is
     * rejected — which is the point. The helper ticks the required box so
     * these tests keep testing what they are about.
     */
    consent: { enquiry: true, marketing: false, terms: false },
    formSlug: slug,
    elapsedMs: 5000,
    values: { name: 'Ada Lovelace', email },
    attribution,
  };
}

beforeAll(async () => {
  const form = await prisma.form.create({
    data: {
      name: `UTM form ${suffix}`,
      slug,
      isActive: true,
      fields: {
        create: [
          {
            type: 'NAME',
            label: 'Name',
            name: 'name',
            isRequired: true,
            sortOrder: 0,
            width: 'full',
          },
          {
            type: 'EMAIL',
            label: 'Email',
            name: 'email',
            isRequired: true,
            sortOrder: 1,
            width: 'full',
          },
        ],
      },
    },
  });
  formId = form.id;
});

beforeEach(() => {
  __resetRateLimits();
});

afterAll(async () => {
  await prisma.formSubmission.deleteMany({ where: { formId } });
  await prisma.lead.deleteMany({ where: { formId } });
  await prisma.formField.deleteMany({ where: { formId } });
  await prisma.form.deleteMany({ where: { id: formId } });
  await prisma.$disconnect();
});

describe('attribution reaches the lead', () => {
  it('stores first touch and last touch separately', async () => {
    const email = `journey+${suffix}@example.test`;

    // The journey from the unit tests, as the browser would report it: found
    // via a Google ad, converted after a LinkedIn remarketing click.
    const result = await submitForm(
      payload(email, {
        utmSource: 'linkedin',
        utmMedium: 'paid_social',
        utmCampaign: 'remarketing',
        firstUtmSource: 'google',
        firstUtmMedium: 'cpc',
        firstUtmCampaign: 'dropbox_business',
        firstLandingUrl: '/',
        firstTouchAt: '2026-09-01T10:00:00.000Z',
        referrer: 'https://www.linkedin.com/',
        landingUrl: '/contact?utm_source=linkedin',
        pagePath: '/contact',
      }),
    );
    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });

    expect(lead.utmSource).toBe('linkedin');
    expect(lead.utmMedium).toBe('paid_social');
    expect(lead.utmCampaign).toBe('remarketing');

    expect(lead.firstUtmSource).toBe('google');
    expect(lead.firstUtmMedium).toBe('cpc');
    expect(lead.firstUtmCampaign).toBe('dropbox_business');
    expect(lead.firstLandingUrl).toBe('/');
    expect(lead.firstTouchAt?.toISOString()).toBe('2026-09-01T10:00:00.000Z');
  });

  it('falls back to the last touch as first touch for a single-visit lead', async () => {
    const email = `single+${suffix}@example.test`;

    await submitForm(
      payload(email, {
        utmSource: 'newsletter',
        utmMedium: 'email',
        utmCampaign: 'september',
      }),
    );

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    // They only ever had one touch, so it is both.
    expect(lead.firstUtmSource).toBe('newsletter');
    expect(lead.utmSource).toBe('newsletter');
    expect(lead.firstTouchAt).toBeTruthy();
  });

  it('accepts a submission with no attribution at all', async () => {
    const email = `direct+${suffix}@example.test`;

    const result = await submitForm({
      consent: { enquiry: true, marketing: false, terms: false },
      formSlug: slug,
      elapsedMs: 5000,
      values: { name: 'Ada Lovelace', email },
    });
    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    expect(lead.utmSource).toBeNull();
    expect(lead.utmCampaign).toBeNull();
    // A direct lead still gets a first-touch timestamp, so it can be aged.
    expect(lead.firstTouchAt).toBeTruthy();
  });

  it('stores a custom source that matches no preset', async () => {
    const email = `custom+${suffix}@example.test`;
    await submitForm(
      payload(email, {
        utmSource: 'partner_portal',
        utmMedium: 'referral',
        utmCampaign: 'reseller_2026',
        utmTerm: 'cloud_storage',
        utmContent: 'sidebar_banner',
      }),
    );

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    expect(lead.utmSource).toBe('partner_portal');
    expect(lead.utmTerm).toBe('cloud_storage');
    expect(lead.utmContent).toBe('sidebar_banner');
  });

  it('records internal CTA attribution separately from the external campaign', async () => {
    const email = `cta+${suffix}@example.test`;
    await submitForm(
      payload(email, {
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'dropbox_business',
        ctaLabel: 'Get a quote',
        ctaLocation: 'homepage_hero',
      }),
    );

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    // The internal placement must not be smuggled into utm_source.
    expect(lead.ctaLocation).toBe('homepage_hero');
    expect(lead.ctaLabel).toBe('Get a quote');
    expect(lead.utmSource).toBe('google');
  });
});

describe('campaign reporting over a date range', () => {
  it('groups the leads this file created by source and campaign', async () => {
    const range = resolveRange({ range: 'today' });

    const [sources, campaigns, kpis] = await Promise.all([
      getSourcePerformance(range),
      getCampaignPerformance(range),
      getCrmKpis(range),
    ]);

    const source = (key: string) => sources.find((row) => row.key === key);
    const campaign = (key: string) => campaigns.find((row) => row.key === key);

    // Every lead created above landed today, so each shows up in the range.
    expect(source('linkedin')?.leads).toBeGreaterThanOrEqual(1);
    expect(source('newsletter')?.leads).toBeGreaterThanOrEqual(1);
    expect(source('partner_portal')?.leads).toBeGreaterThanOrEqual(1);
    expect(campaign('remarketing')?.leads).toBeGreaterThanOrEqual(1);

    // The lead with no attribution is grouped rather than dropped.
    expect(source('direct')?.leads).toBeGreaterThanOrEqual(1);

    // Conversion rate is a real ratio, not a placeholder.
    for (const row of [...sources, ...campaigns]) {
      expect(row.conversionRate).toBeGreaterThanOrEqual(0);
      expect(row.conversionRate).toBeLessThanOrEqual(100);
      expect(row.won).toBeLessThanOrEqual(row.leads);
    }

    expect(kpis.find((kpi) => kpi.key === 'total')!.value).toBeGreaterThanOrEqual(5);
  });

  it('reports nothing for a range the leads do not fall in', async () => {
    const sources = await getSourcePerformance(
      resolveRange({ from: '2020-01-01', to: '2020-01-31' }),
    );
    expect(sources).toEqual([]);
  });
});
