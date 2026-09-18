import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mockAuth,
  formData,
  uniqueSuffix,
  TEST_ACTOR,
  ensureTestCountry,
  ensureSecondCountry,
} from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createPage, duplicatePageToCountry, setPageStatus } = await import(
  '@/lib/actions/pages'
);
const { createBlogPost, duplicateBlogPostToCountry } = await import('@/lib/actions/blog');
const { getPublishedPage, findPublishedPageCountries } = await import('@/lib/services/pages');
const { getPublishedPost } = await import('@/lib/services/blog');
const { getPublicProduct, selectProducts } = await import('@/lib/services/products');
const { getNavigations } = await import('@/lib/services/navigation');
const { listCountries, invalidateCountryCache } = await import('@/lib/country/registry');
const { resolveMarketOptions } = await import('@/lib/country/switch');

/**
 * The properties that make two storefronts genuinely independent.
 *
 * Every assertion here is about isolation: the same slug resolving to different
 * content in each market, a missing page never falling back to the other
 * market's, pricing that does not leak, and a duplicate that arrives as a
 * draft rather than as a second indexed copy.
 */

const suffix = uniqueSuffix();
const slug = `mc-plan-${suffix}`;

let india = '';
let uae = '';
const pageIds: string[] = [];
const postIds: string[] = [];
let productId = '';

/** Both markets, as the registry resolves them. */
async function contexts() {
  const all = await listCountries();
  const home = all.find((country) => country.id === india);
  const second = all.find((country) => country.id === uae);
  if (!home || !second) throw new Error('Test countries are missing');
  return { home, second };
}

beforeAll(async () => {
  india = await ensureTestCountry();
  uae = await ensureSecondCountry();

  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-multi-country' },
    update: {},
    create: { slug: 'test-role-multi-country', name: 'Test Role Markets', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });

  const product = await prisma.product.create({
    data: {
      name: `Markets plan ${suffix}`,
      slug,
      status: 'PUBLISHED',
      currency: 'INR',
      features: [],
      benefits: [],
      specs: [],
      galleryIds: [],
    },
  });
  productId = product.id;
});

afterAll(async () => {
  await prisma.productCountry.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.blogPostTag.deleteMany({ where: { postId: { in: postIds } } });
  await prisma.blogPost.deleteMany({ where: { id: { in: postIds } } });
  await prisma.pageSection.deleteMany({ where: { pageId: { in: pageIds } } });
  await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
  await prisma.navigation.deleteMany({ where: { slug: { startsWith: `mc-menu-${suffix}` } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-multi-country' } });
  await prisma.$disconnect();
});

describe('pages are per market', () => {
  it('allows the same slug in two markets', async () => {
    const first = await createPage(
      formData({ title: `Markets page ${suffix}`, slug: `mc-page-${suffix}`, countryId: india }),
    );
    expect(first.ok, JSON.stringify(first)).toBe(true);
    const firstId = (first as { data: { id: string } }).data.id;
    pageIds.push(firstId);

    const second = await createPage(
      formData({ title: `Markets page AE ${suffix}`, slug: `mc-page-${suffix}`, countryId: uae }),
    );
    expect(second.ok, JSON.stringify(second)).toBe(true);
    const secondId = (second as { data: { id: string } }).data.id;
    pageIds.push(secondId);

    const rows = await prisma.page.findMany({
      where: { slug: `mc-page-${suffix}` },
      select: { id: true, countryId: true },
    });
    // Two independent rows, one per market — not a renamed second copy.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.countryId))).toEqual(new Set([india, uae]));
  });

  it('never serves one market a page that only exists in the other', async () => {
    const onlyIndia = await createPage(
      formData({
        title: `India only ${suffix}`,
        slug: `mc-india-only-${suffix}`,
        status: 'PUBLISHED',
        countryId: india,
      }),
    );
    expect(onlyIndia.ok).toBe(true);
    pageIds.push((onlyIndia as { data: { id: string } }).data.id);

    expect(await getPublishedPage(india, `mc-india-only-${suffix}`)).not.toBeNull();
    expect(await getPublishedPage(uae, `mc-india-only-${suffix}`)).toBeNull();
  });

  it('only lists a market as an alternate once its page is published', async () => {
    const pageSlug = `mc-alt-${suffix}`;
    const first = await createPage(
      formData({ title: `Alt ${suffix}`, slug: pageSlug, status: 'PUBLISHED', countryId: india }),
    );
    const firstId = (first as { data: { id: string } }).data.id;
    pageIds.push(firstId);

    const second = await createPage(
      formData({ title: `Alt AE ${suffix}`, slug: pageSlug, countryId: uae }),
    );
    const secondId = (second as { data: { id: string } }).data.id;
    pageIds.push(secondId);

    // The UAE page is still a draft, so it is not an alternate yet.
    expect(await findPublishedPageCountries(pageSlug)).toEqual([india]);

    expect((await setPageStatus(secondId, 'PUBLISHED')).ok).toBe(true);
    const after = await findPublishedPageCountries(pageSlug);
    expect(new Set(after)).toEqual(new Set([india, uae]));
  });
});

describe('duplicate to country', () => {
  it('copies the sections and arrives as a draft', async () => {
    const source = await createPage(
      formData({
        title: `Duplicate me ${suffix}`,
        slug: `mc-dup-${suffix}`,
        status: 'PUBLISHED',
        countryId: india,
      }),
    );
    const sourceId = (source as { data: { id: string } }).data.id;
    pageIds.push(sourceId);

    await prisma.pageSection.create({
      data: {
        pageId: sourceId,
        blockType: 'richText',
        sortOrder: 10,
        content: { html: '<p>Shared copy</p>' },
        settings: {},
      },
    });

    const result = await duplicatePageToCountry(sourceId, uae);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const copyId = (result as { data: { id: string } }).data.id;
    pageIds.push(copyId);

    const copy = await prisma.page.findUniqueOrThrow({
      where: { id: copyId },
      include: { sections: true },
    });

    expect(copy.countryId).toBe(uae);
    expect(copy.slug).toBe(`mc-dup-${suffix}`);
    // Never published automatically: a duplicate must be reviewed first.
    expect(copy.status).toBe('DRAFT');
    expect(copy.isHomepage).toBe(false);
    expect(copy.sections).toHaveLength(1);
    expect(copy.sections[0]?.blockType).toBe('richText');
    // The copy canonicals to its own URL, so the source's is not inherited.
    expect(copy.canonicalUrl).toBeNull();
  });

  it('refuses to overwrite an existing page without confirmation', async () => {
    const source = await createPage(
      formData({ title: `Clash ${suffix}`, slug: `mc-clash-${suffix}`, countryId: india }),
    );
    const sourceId = (source as { data: { id: string } }).data.id;
    pageIds.push(sourceId);

    const existing = await createPage(
      formData({ title: `Clash AE ${suffix}`, slug: `mc-clash-${suffix}`, countryId: uae }),
    );
    const existingId = (existing as { data: { id: string } }).data.id;
    pageIds.push(existingId);

    const refused = await duplicatePageToCountry(sourceId, uae);
    expect(refused.ok).toBe(false);
    expect((refused as { fieldErrors?: Record<string, string[]> }).fieldErrors?._confirm).toBeTruthy();

    // The target is untouched until the caller explicitly confirms.
    const untouched = await prisma.page.findUniqueOrThrow({ where: { id: existingId } });
    expect(untouched.title).toBe(`Clash AE ${suffix}`);

    const confirmed = await duplicatePageToCountry(sourceId, uae, { replaceExisting: true });
    expect(confirmed.ok, JSON.stringify(confirmed)).toBe(true);
    const replaced = await prisma.page.findUniqueOrThrow({ where: { id: existingId } });
    expect(replaced.title).toBe(`Clash ${suffix}`);
    expect(replaced.status).toBe('DRAFT');
  });

  it('copies an article into another market as a draft at the same slug', async () => {
    const created = await createBlogPost(
      formData({
        title: `Markets article ${suffix}`,
        slug: `mc-article-${suffix}`,
        status: 'PUBLISHED',
        content: '<p>Guide</p>',
        countryId: india,
        tags: [],
        options: {},
      }),
    );
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const postId = (created as { data: { id: string } }).data.id;
    postIds.push(postId);

    const copied = await duplicateBlogPostToCountry(postId, uae);
    expect(copied.ok, JSON.stringify(copied)).toBe(true);
    const copyId = (copied as { data: { id: string } }).data.id;
    postIds.push(copyId);

    const copy = await prisma.blogPost.findUniqueOrThrow({ where: { id: copyId } });
    expect(copy.countryId).toBe(uae);
    expect(copy.slug).toBe(`mc-article-${suffix}`);
    expect(copy.status).toBe('DRAFT');

    // The draft is invisible publicly until somebody publishes it.
    expect(await getPublishedPost(uae, `mc-article-${suffix}`)).toBeNull();
    expect(await getPublishedPost(india, `mc-article-${suffix}`)).not.toBeNull();
  });
});

describe('product pricing is per market', () => {
  it('sells at a different price in each market and never converts', async () => {
    await prisma.productCountry.createMany({
      data: [
        {
          productId,
          countryId: india,
          status: 'PUBLISHED',
          currency: 'INR',
          monthlyPrice: '1500.00',
        },
        {
          productId,
          countryId: uae,
          status: 'PUBLISHED',
          currency: 'AED',
          monthlyPrice: '69.00',
        },
      ],
      skipDuplicates: true,
    });

    const { home, second } = await contexts();

    const inIndia = await getPublicProduct(home, slug);
    const inUae = await getPublicProduct(second, slug);

    expect(inIndia?.currency).toBe('INR');
    expect(inIndia?.monthlyPrice).toBe('1500');
    expect(inUae?.currency).toBe('AED');
    expect(inUae?.monthlyPrice).toBe('69');

    // Each market's URL carries its own prefix.
    expect(inIndia?.href).toBe(`/products/${slug}`);
    expect(inUae?.href).toBe(`/ae/products/${slug}`);
  });

  it('keeps a hand-typed CTA and its copy inside the market being read', async () => {
    /*
     * Caught on a live deployment: the product page's own URL was built for the
     * market, but the CTA configured next to it was rendered as typed, so the
     * button on the UAE page opened India's page — at India's prices.
     */
    await prisma.productCountry.updateMany({
      where: { productId, countryId: { in: [india, uae] } },
      data: {
        ctaUrl: '/contact',
        shortDescription: 'Talk to <a href="/contact">our team</a> or read the <a href="https://example.com/docs">docs</a>.',
      },
    });

    const { home, second } = await contexts();
    const inIndia = await getPublicProduct(home, slug);
    const inUae = await getPublicProduct(second, slug);

    expect(inIndia?.ctaUrl).toBe('/contact');
    expect(inUae?.ctaUrl).toBe('/ae/contact');

    // Links written into the copy follow the same rule, and an external one is
    // left exactly as it was.
    expect(inUae?.shortDescription).toContain('href="/ae/contact"');
    expect(inUae?.shortDescription).toContain('href="https://example.com/docs"');
    expect(inIndia?.shortDescription).toContain('href="/contact"');
  });

  it('withdraws the product from a market when its row is unpublished', async () => {
    const { home, second } = await contexts();

    await prisma.productCountry.updateMany({
      where: { productId, countryId: uae },
      data: { status: 'DRAFT' },
    });

    expect(await getPublicProduct(second, slug)).toBeNull();
    expect(await getPublicProduct(home, slug)).not.toBeNull();

    const uaeCatalogue = await selectProducts(second, { source: 'all', limit: 24 });
    expect(uaeCatalogue.some((product) => product.slug === slug)).toBe(false);

    await prisma.productCountry.updateMany({
      where: { productId, countryId: uae },
      data: { status: 'PUBLISHED' },
    });
  });
});

describe('navigation is per market', () => {
  it('returns only the menus that belong to the market asked for', async () => {
    const { home, second } = await contexts();

    await prisma.navigation.create({
      data: {
        countryId: india,
        name: `India header ${suffix}`,
        slug: `mc-menu-${suffix}-in`,
        location: 'HEADER',
      },
    });
    await prisma.navigation.create({
      data: {
        countryId: uae,
        name: `UAE header ${suffix}`,
        slug: `mc-menu-${suffix}-ae`,
        location: 'HEADER',
      },
    });

    const indiaMenus = await getNavigations(home, 'HEADER');
    const uaeMenus = await getNavigations(second, 'HEADER');

    expect(indiaMenus.some((menu) => menu.slug === `mc-menu-${suffix}-in`)).toBe(true);
    expect(indiaMenus.some((menu) => menu.slug === `mc-menu-${suffix}-ae`)).toBe(false);
    expect(uaeMenus.some((menu) => menu.slug === `mc-menu-${suffix}-ae`)).toBe(true);
    expect(uaeMenus.some((menu) => menu.slug === `mc-menu-${suffix}-in`)).toBe(false);
  });
});

describe('leads carry their storefront', () => {
  it('records the market a lead was captured in', async () => {
    const lead = await prisma.lead.create({
      data: {
        countryId: uae,
        name: `Markets lead ${suffix}`,
        email: `markets-${suffix}@example.test`,
        status: 'NEW',
      },
      include: { country: { select: { code: true } } },
    });

    expect(lead.country.code).toBe('AE');

    const uaeLeads = await prisma.lead.count({
      where: { countryId: uae, email: `markets-${suffix}@example.test` },
    });
    const indiaLeads = await prisma.lead.count({
      where: { countryId: india, email: `markets-${suffix}@example.test` },
    });
    expect(uaeLeads).toBe(1);
    expect(indiaLeads).toBe(0);

    await prisma.lead.delete({ where: { id: lead.id } });
  });
});

describe('the market switcher only offers somewhere to land', () => {
  /*
   * A market created before its content is active and empty — the state every
   * new market starts in. Offering it would hand the visitor a link to a 404,
   * which is what happened to the UAE in production before it had any pages.
   *
   * Qatar is used rather than one of the fixture markets precisely because it
   * starts empty, which is the condition under test.
   */
  const homeSlug = `mc-home-${suffix}`;
  let qatar = '';
  const homeIds: string[] = [];

  beforeAll(async () => {
    const country = await prisma.country.upsert({
      where: { code: 'QA' },
      update: { isActive: true },
      create: {
        name: 'Qatar',
        code: 'QA',
        slug: 'qa',
        locale: 'en-QA',
        currency: 'QAR',
        currencySymbol: 'QAR',
        isDefault: false,
        isActive: true,
        sortOrder: 9,
      },
    });
    qatar = country.id;

    /*
     * The UAE needs a home page of its own, created here rather than assumed.
     * The assertion below is that a market with somewhere to land is still
     * offered while Qatar is not, and a freshly migrated database has no
     * content at all — so a suite that inherited one was really asserting
     * against seed data, and failed wherever that data was absent.
     */
    const created = await createPage(
      formData({
        title: `Home AE ${suffix}`,
        slug: `mc-home-ae-${suffix}`,
        status: 'PUBLISHED',
        countryId: uae,
      }),
    );
    if (!created.ok) throw new Error(`UAE home page: ${JSON.stringify(created)}`);
    const homeId = (created as { data: { id: string } }).data.id;
    homeIds.push(homeId);
    await prisma.page.update({ where: { id: homeId }, data: { isHomepage: true } });

    invalidateCountryCache();
  });

  afterAll(async () => {
    await prisma.pageSection.deleteMany({ where: { pageId: { in: homeIds } } });
    await prisma.page.deleteMany({ where: { id: { in: homeIds } } });
    await prisma.country.deleteMany({ where: { id: qatar } });
    invalidateCountryCache();
  });

  it('leaves out an active market with no published home page', async () => {
    const { home } = await contexts();
    const options = await resolveMarketOptions(home, '/');

    expect(options.some((option) => option.code === 'QA')).toBe(false);
    // The markets that do have content are still offered.
    expect(options.some((option) => option.code === 'AE')).toBe(true);
  });

  it('offers that market as soon as it has one, at its own prefix', async () => {
    const created = await createPage(
      formData({
        title: `Home QA ${suffix}`,
        slug: homeSlug,
        status: 'PUBLISHED',
        countryId: qatar,
      }),
    );
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const id = (created as { data: { id: string } }).data.id;
    homeIds.push(id);
    await prisma.page.update({ where: { id }, data: { isHomepage: true } });

    const { home } = await contexts();
    const options = await resolveMarketOptions(home, '/');

    expect(options.find((option) => option.code === 'QA')?.href).toBe('/qa');
    expect(options.find((option) => option.code === 'IN')?.href).toBe('/');
  });
});
