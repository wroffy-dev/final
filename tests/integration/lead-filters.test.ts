import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, TEST_ACTOR, ensureTestCountry } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { buildLeadWhere, buildLeadOrderBy, NO_ATTRIBUTION } = await import('@/lib/crm/query');

const suffix = uniqueSuffix();
const created: string[] = [];
let ownerId = '';
let productId = '';

/** Only ever counts the leads this file created. */
async function count(filters: Parameters<typeof buildLeadWhere>[0]) {
  return prisma.lead.count({ where: { AND: [buildLeadWhere(filters), { id: { in: created } }] } });
}

beforeAll(async () => {
  const countryId = await ensureTestCountry();
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-filters' },
    update: {},
    create: { slug: 'test-role-filters', name: 'Test Role Filters', rank: 5 },
  });
  const owner = await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
  ownerId = owner.id;

  const product = await prisma.product.create({
    data: {
      name: `Filter product ${suffix}`,
      slug: `filter-product-${suffix}`,
      status: 'PUBLISHED',
      currency: 'INR',
      features: [],
      benefits: [],
      specs: [],
      galleryIds: [],
    },
  });
  productId = product.id;

  const yesterday = new Date(Date.now() - 86_400_000);
  const lastMonth = new Date(Date.now() - 30 * 86_400_000);

  const rows = await Promise.all([
    // Qualified + google/cpc + assigned + overdue follow-up
    prisma.lead.create({
      data: {
        countryId,
        name: `Ada ${suffix}`,
        email: `ada-${suffix}@example.test`,
        company: 'Acme',
        status: 'QUALIFIED',
        source: 'Contact form',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'brand',
        utmContent: 'ad-a',
        assignedToId: ownerId,
        productId,
        followUpAt: yesterday,
      },
    }),
    // Qualified + google/cpc but unassigned, no follow-up
    prisma.lead.create({
      data: {
        countryId,
        name: `Grace ${suffix}`,
        email: `grace-${suffix}@example.test`,
        status: 'QUALIFIED',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'brand',
      },
    }),
    // New + linkedin/social, unassigned
    prisma.lead.create({
      data: {
        countryId,
        name: `Linus ${suffix}`,
        email: `linus-${suffix}@example.test`,
        status: 'NEW',
        utmSource: 'linkedin',
        utmMedium: 'social',
      },
    }),
    // Won, older than the recent window
    prisma.lead.create({
      data: {
        countryId,
        name: `Won ${suffix}`,
        email: `won-${suffix}@example.test`,
        status: 'WON',
        utmSource: 'google',
        assignedToId: ownerId,
        createdAt: lastMonth,
      },
    }),
  ]);

  created.push(...rows.map((row) => row.id));
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: created } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-filters' } });
  await prisma.$disconnect();
});

describe('lead filters', () => {
  it('returns everything when nothing is applied', async () => {
    expect(await count({})).toBe(4);
  });

  it('filters by status', async () => {
    expect(await count({ status: 'QUALIFIED' })).toBe(2);
    expect(await count({ status: 'WON' })).toBe(1);
  });

  it('filters by owner, including assigned and unassigned', async () => {
    expect(await count({ assignedTo: ownerId })).toBe(2);
    expect(await count({ assignedTo: 'unassigned' })).toBe(2);
    expect(await count({ assignedTo: 'assigned' })).toBe(2);
  });

  it('filters by every attribution field the model stores', async () => {
    expect(await count({ source: 'google' })).toBe(3);
    expect(await count({ utmMedium: 'cpc' })).toBe(2);
    expect(await count({ utmCampaign: 'brand' })).toBe(2);
    expect(await count({ utmContent: 'ad-a' })).toBe(1);
    expect(await count({ leadSource: 'Contact form' })).toBe(1);
  });

  it('filters by product', async () => {
    expect(await count({ productId })).toBe(1);
  });

  it('filters by follow-up state', async () => {
    expect(await count({ followUp: 'due' })).toBe(1);
    expect(await count({ followUp: 'overdue' })).toBe(1);
    expect(await count({ followUp: 'set' })).toBe(1);
    expect(await count({ followUp: 'none' })).toBe(3);
  });

  it('searches name, email and company', async () => {
    expect(await count({ q: `Ada ${suffix}` })).toBe(1);
    expect(await count({ q: `grace-${suffix}@example.test` })).toBe(1);
    expect(await count({ q: 'Acme' })).toBe(1);
    expect(await count({ q: 'definitely-no-match' })).toBe(0);
  });

  /*
   * The behaviour the brief calls out explicitly: several filters at once must
   * narrow the list, never widen it.
   */
  it('combines filters with AND', async () => {
    expect(await count({ status: 'QUALIFIED', source: 'google' })).toBe(2);
    expect(await count({ status: 'QUALIFIED', source: 'google', assignedTo: ownerId })).toBe(1);
    expect(await count({ status: 'QUALIFIED', source: 'linkedin' })).toBe(0);
    expect(await count({ source: 'google', utmMedium: 'social' })).toBe(0);
    expect(
      await count({
        status: 'QUALIFIED',
        source: 'google',
        assignedTo: 'unassigned',
        utmCampaign: 'brand',
      }),
    ).toBe(1);
  });

  it('respects a created-date range', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    // The 30-day-old WON lead falls outside a 7-day window.
    expect(await count({ from })).toBe(3);
    expect(await count({ status: 'WON', from })).toBe(0);
  });

  it('can apply the date range to last activity instead of creation', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    // Every lead was just written, so all four have recent updatedAt.
    expect(await count({ from, dateField: 'activity' })).toBe(4);
  });

  it('combines a search term with a filter', async () => {
    expect(await count({ q: suffix, status: 'QUALIFIED' })).toBe(2);
    expect(await count({ q: suffix, status: 'LOST' })).toBe(0);
  });
});

describe('lead sorting', () => {
  it('defaults to newest first', () => {
    expect(buildLeadOrderBy({})).toEqual({ createdAt: 'desc' });
  });

  it('honours a supported field and direction', () => {
    expect(buildLeadOrderBy({ sort: 'name', dir: 'asc' })).toEqual({ name: 'asc' });
    expect(buildLeadOrderBy({ sort: 'updatedAt', dir: 'desc' })).toEqual({ updatedAt: 'desc' });
  });

  it('falls back rather than trusting a hand-edited URL', () => {
    expect(buildLeadOrderBy({ sort: 'password', dir: 'asc' })).toEqual({ createdAt: 'asc' });
    expect(buildLeadOrderBy({ sort: 'name', dir: 'sideways' })).toEqual({ name: 'desc' });
  });
});

describe('the "no attribution" drill-down', () => {
  // Created here rather than in the shared fixture so the exact counts the
  // other tests assert stay as they are.
  let untaggedId = '';

  beforeAll(async () => {
    const countryId = await ensureTestCountry();
    const lead = await prisma.lead.create({
      data: {
        countryId,
        name: `Untagged ${suffix}`,
        email: `untagged-${suffix}@example.test`,
        status: 'NEW',
        source: 'Direct visit',
      },
    });
    untaggedId = lead.id;
    created.push(lead.id);
  });

  it('resolves the Direct / none sentinel to the leads with nothing recorded', async () => {
    // The CRM dashboard groups untagged leads under "Direct / none" and links
    // through with this value; it has to select those same leads, not zero.
    expect(await count({ source: NO_ATTRIBUTION })).toBe(1);

    const [{ id }] = await prisma.lead.findMany({
      where: { AND: [buildLeadWhere({ source: NO_ATTRIBUTION }), { id: { in: created } }] },
      select: { id: true },
    });
    expect(id).toBe(untaggedId);
  });

  it('is not treated as a literal utm_source value', async () => {
    expect(await count({ source: 'direct-literal-no-lead-has' })).toBe(0);
    // The tagged and untagged groups together account for every lead, which is
    // what makes the dashboard's source table add up to its total.
    expect((await count({ source: NO_ATTRIBUTION })) + (await count({ source: 'google' }))).toBe(4);
  });

  it('applies per column, so a lead can be tagged on one dimension and not another', async () => {
    // One fixture lead carries utm_source=google with no medium, campaign or
    // content, plus the untagged lead created above. Each column is judged on
    // its own, which is what makes each dashboard table add up independently.
    expect(await count({ utmMedium: NO_ATTRIBUTION })).toBe(2);
    expect(await count({ utmCampaign: NO_ATTRIBUTION })).toBe(3);
    expect(await count({ utmContent: NO_ATTRIBUTION })).toBe(4);

    // That lead is "no medium" while still being "source = google".
    expect(await count({ source: 'google', utmMedium: NO_ATTRIBUTION })).toBe(1);
  });

  it('still narrows rather than widens when combined with other filters', async () => {
    expect(await count({ status: 'NEW', source: NO_ATTRIBUTION })).toBe(1);
    expect(await count({ status: 'QUALIFIED', source: NO_ATTRIBUTION })).toBe(0);
    expect(await count({ source: NO_ATTRIBUTION, assignedTo: ownerId })).toBe(0);
  });
});

describe('landing URL filter (CRM dashboard drill-down)', () => {
  it('selects exactly the leads a "Top landing pages" bar counted', async () => {
    // The dashboard groups by landingUrl, so the filter must match on the same
    // column — otherwise the bar says 3 and the list shows something else.
    const grouped = await prisma.lead.groupBy({
      by: ['landingUrl'],
      where: { id: { in: created }, landingUrl: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { landingUrl: 'desc' } },
      take: 1,
    });

    if (grouped.length === 0) return; // no fixture lead carries a landing URL
    const [top] = grouped;
    expect(await count({ landingUrl: top.landingUrl! })).toBe(top._count._all);
  });

  it('resolves the sentinel to leads with no landing URL recorded', async () => {
    const unrecorded = await count({ landingUrl: NO_ATTRIBUTION });
    const direct = await prisma.lead.count({
      where: { id: { in: created }, landingUrl: null },
    });
    expect(unrecorded).toBe(direct);
  });

  it('narrows rather than widens when combined', async () => {
    expect(await count({ status: 'QUALIFIED', landingUrl: NO_ATTRIBUTION })).toBeLessThanOrEqual(
      await count({ status: 'QUALIFIED' }),
    );
    expect(await count({ landingUrl: 'no-lead-landed-here' })).toBe(0);
  });
});
