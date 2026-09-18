import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth, uniqueSuffix, ensureSystemRoles, TEST_ACTOR } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { syncCountryContent } = await import('@/lib/actions/country-sync');
const { deleteProduct, bulkProductAction, deleteProductCategory } = await import(
  '@/lib/actions/products'
);
const { invalidateCountryCache } = await import('@/lib/country/registry');
const { offerIn, isOfferedIn } = await import('@/lib/country/availability');
const admin = await import('@/lib/country/admin');

/**
 * Country isolation: the rules a market's content depends on.
 *
 * Every test here is a statement about **something not happening**. Deleting in
 * one market must not delete in another; running the sync again must not
 * resurrect what a market removed, must not overwrite what it edited, and must
 * not create a second copy of anything. Those are the guarantees that make the
 * button safe to press, and none of them is visible from reading one function —
 * they only show up end to end, against a real database.
 *
 * The suite drives two destination markets, because half the failures this
 * guards against are invisible with only one: "deleted from UAE" and "deleted
 * everywhere" look identical until Qatar is there to disagree.
 */

const suffix = uniqueSuffix();
let indiaId = '';
let uaeId = '';
let qatarId = '';
const createdProductIds: string[] = [];
const createdCategoryIds: string[] = [];

/** Runs an action as though the admin had this market selected. */
async function asMarket<T>(countryId: string, run: () => Promise<T>): Promise<T> {
  const country = await prisma.country.findUniqueOrThrow({ where: { id: countryId } });
  const spy = vi.spyOn(admin, 'scopeForUser').mockResolvedValue({
    country: {
      id: country.id,
      name: country.name,
      code: country.code,
      slug: country.slug,
      locale: country.locale,
      currency: country.currency,
      currencySymbol: country.currencySymbol,
      isDefault: country.isDefault,
    },
    countries: [],
    canSwitch: true,
  } as never);
  try {
    return await run();
  } finally {
    spy.mockRestore();
  }
}

async function market(code: string, name: string, currency: string) {
  const row = await prisma.country.upsert({
    where: { code },
    update: { isActive: true },
    create: {
      name,
      code,
      slug: code.toLowerCase(),
      locale: `en-${code}`,
      currency,
      currencySymbol: currency,
      timezone: 'UTC',
      isActive: true,
    },
    select: { id: true },
  });
  return row.id;
}

/** A product on sale in the given markets. */
async function productIn(name: string, countryIds: string[]) {
  const product = await prisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${suffix}`,
      status: 'PUBLISHED',
      currency: 'INR',
      countries: {
        create: countryIds.map((countryId) => ({ countryId, status: 'PUBLISHED' })),
      },
    },
    select: { id: true },
  });
  createdProductIds.push(product.id);
  return product.id;
}

async function offersProduct(productId: string, countryId: string) {
  const row = await prisma.productCountry.findUnique({
    where: { productId_countryId: { productId, countryId } },
    select: { deletedAt: true },
  });
  return row !== null && row.deletedAt === null;
}

beforeAll(async () => {
  await ensureSystemRoles();
  const role = await prisma.userRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });

  const india = await prisma.country.findFirstOrThrow({ where: { isDefault: true } });
  indiaId = india.id;
  uaeId = await market('AE', 'United Arab Emirates', 'AED');
  qatarId = await market('QA', 'Qatar', 'QAR');
  invalidateCountryCache();
});

afterAll(async () => {
  for (const countryId of [uaeId, qatarId]) {
    await prisma.countrySyncMapping.deleteMany({ where: { targetCountryId: countryId } });
    await prisma.countrySyncRun.deleteMany({ where: { targetCountryId: countryId } });
    await prisma.navigationItem.deleteMany({ where: { navigation: { countryId } } });
    await prisma.navigation.deleteMany({ where: { countryId } });
    await prisma.popup.deleteMany({ where: { countryId } });
    await prisma.pageSection.deleteMany({ where: { page: { countryId } } });
    await prisma.page.deleteMany({ where: { countryId } });
    await prisma.form.deleteMany({ where: { countryId } });
  }
  await prisma.productCountry.deleteMany({ where: { productId: { in: createdProductIds } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.pageCategoryCountry.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.productCategoryCountry.deleteMany({
    where: { categoryId: { in: createdCategoryIds } },
  });
  await prisma.productCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.page.deleteMany({ where: { slug: { contains: suffix } } });
});

describe('deleting a product is local to one market', () => {
  it('Test 5 — removing it from the UAE leaves India and Qatar selling it', async () => {
    const productId = await productIn('Isolation A', [indiaId, uaeId, qatarId]);

    const result = await asMarket(uaeId, () => deleteProduct(productId));
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    expect(await offersProduct(productId, uaeId)).toBe(false);
    expect(await offersProduct(productId, indiaId)).toBe(true);
    expect(await offersProduct(productId, qatarId)).toBe(true);

    // The shared product identity survives, because two markets still use it.
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.deletedAt).toBeNull();
  });

  it('Test 6 — removing it from India leaves the UAE and Qatar selling it', async () => {
    const productId = await productIn('Isolation B', [indiaId, uaeId, qatarId]);

    const result = await asMarket(indiaId, () => deleteProduct(productId));
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    // India is the sync source, but it is still just a market.
    expect(await offersProduct(productId, indiaId)).toBe(false);
    expect(await offersProduct(productId, uaeId)).toBe(true);
    expect(await offersProduct(productId, qatarId)).toBe(true);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.deletedAt).toBeNull();
  });

  it('retires the shared product only once no market sells it', async () => {
    const productId = await productIn('Isolation C', [indiaId, uaeId]);

    await asMarket(uaeId, () => deleteProduct(productId));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).deletedAt).toBeNull();

    await asMarket(indiaId, () => deleteProduct(productId));
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).deletedAt,
    ).not.toBeNull();
  });

  it('Test 12 — a bulk delete in one market leaves the others untouched', async () => {
    const ids = await Promise.all([
      productIn('Bulk A', [indiaId, uaeId, qatarId]),
      productIn('Bulk B', [indiaId, uaeId, qatarId]),
      productIn('Bulk C', [indiaId, uaeId, qatarId]),
    ]);

    const result = await asMarket(uaeId, () =>
      bulkProductAction({ ids, action: 'delete' }),
    );
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    for (const id of ids) {
      expect(await offersProduct(id, uaeId), `${id} in UAE`).toBe(false);
      expect(await offersProduct(id, indiaId), `${id} in India`).toBe(true);
      expect(await offersProduct(id, qatarId), `${id} in Qatar`).toBe(true);
      expect((await prisma.product.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    }
  });
});

describe('deleting a category is local to one market', () => {
  it('Test 7 — removing it from the UAE leaves India and Qatar with it', async () => {
    const category = await prisma.productCategory.create({
      data: { name: `Shared category ${suffix}`, slug: `shared-cat-${suffix}` },
      select: { id: true },
    });
    createdCategoryIds.push(category.id);
    await offerIn('PRODUCT_CATEGORY', [category.id], indiaId);
    await offerIn('PRODUCT_CATEGORY', [category.id], uaeId);
    await offerIn('PRODUCT_CATEGORY', [category.id], qatarId);

    const result = await asMarket(uaeId, () => deleteProductCategory(category.id));
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    expect(await isOfferedIn('PRODUCT_CATEGORY', category.id, uaeId)).toBe(false);
    expect(await isOfferedIn('PRODUCT_CATEGORY', category.id, indiaId)).toBe(true);
    expect(await isOfferedIn('PRODUCT_CATEGORY', category.id, qatarId)).toBe(true);

    // The shared taxonomy row is untouched, because two markets still use it.
    expect(
      await prisma.productCategory.findUnique({ where: { id: category.id }, select: { id: true } }),
    ).not.toBeNull();
  });
});

describe('syncing India into a market', () => {
  const pageSlug = `iso-page-${suffix}`;
  const secondSlug = `iso-page-2-${suffix}`;
  let indiaPageId = '';
  let syncedProductId = '';

  const sync = (previewOnly = false) =>
    syncCountryContent({ targetCountryId: uaeId, previewOnly });

  beforeAll(async () => {
    const page = await prisma.page.create({
      data: {
        countryId: indiaId,
        title: `Isolation page ${suffix}`,
        slug: pageSlug,
        status: 'PUBLISHED',
        sections: {
          create: [{ blockType: 'RICH_TEXT', sortOrder: 0, content: { html: '<p>Hello</p>' } }],
        },
      },
      select: { id: true },
    });
    indiaPageId = page.id;

    syncedProductId = await productIn('Synced product', [indiaId]);

    const form = await prisma.form.create({
      data: {
        name: `Isolation form ${suffix}`,
        slug: `iso-form-${suffix}`,
        countryId: indiaId,
        fields: { create: [{ type: 'EMAIL', label: 'Email', name: 'email', sortOrder: 0 }] },
      },
      select: { id: true },
    });

    /*
     * Submissions and a lead on the India form, so the exclusion tests have
     * something that *could* be copied if the allowlist were wrong.
     */
    await prisma.formSubmission.create({
      data: { formId: form.id, countryId: indiaId, data: { email: 'a@b.test' } },
    });
    await prisma.lead.create({
      data: { countryId: indiaId, name: 'India Lead', email: `lead.${suffix}@example.com` },
    });
  });

  it('Test 1 — the first run adds India’s content', async () => {
    const result = await sync();
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);
    expect(result.ok && result.data!.created).toBeGreaterThan(0);

    const page = await prisma.page.findFirst({ where: { countryId: uaeId, slug: pageSlug } });
    expect(page).not.toBeNull();
    // Imported content arrives as a draft for review, never published.
    expect(page!.status).toBe('DRAFT');
    // A canonical naming India's URL would tell search engines this page is a
    // duplicate that need not be shown.
    expect(page!.canonicalUrl).toBeNull();
    expect(await offersProduct(syncedProductId, uaeId)).toBe(true);
  });

  it('Test 2 — a second run adds nothing and duplicates nothing', async () => {
    const before = await prisma.page.count({ where: { countryId: uaeId, slug: pageSlug } });

    const result = await sync();
    expect(result.ok).toBe(true);
    expect(result.ok && result.data!.created).toBe(0);
    expect(result.ok && result.data!.skipped).toBeGreaterThan(0);

    expect(await prisma.page.count({ where: { countryId: uaeId, slug: pageSlug } })).toBe(before);
  });

  it('Test 9 — no leads are ever copied', async () => {
    expect(await prisma.lead.count({ where: { countryId: uaeId } })).toBe(0);
    expect(await prisma.lead.count({ where: { countryId: indiaId } })).toBeGreaterThan(0);
  });

  it('Test 10 — a form arrives with its fields and no submissions', async () => {
    const copy = await prisma.form.findFirstOrThrow({
      where: { countryId: uaeId, name: `Isolation form ${suffix}` },
      include: { fields: true, _count: { select: { submissions: true } } },
    });
    expect(copy.fields).toHaveLength(1);
    expect(copy.fields[0].name).toBe('email');
    // The definition travels; what people sent through it does not.
    expect(copy._count.submissions).toBe(0);
    // Inactive on arrival, so it is read before it starts taking enquiries.
    expect(copy.isActive).toBe(false);

    /*
     * And it keeps India's slug rather than gaining a "-ae" nobody chose.
     * Slugs are unique per market, so both copies can be called the same
     * thing — which is the whole reason the constraint is per market.
     */
    const original = await prisma.form.findFirstOrThrow({
      where: { countryId: indiaId, name: `Isolation form ${suffix}` },
      select: { slug: true },
    });
    expect(copy.slug).toBe(original.slug);
  });

  it('Test 11 — no blog content is copied, and no country blog pages appear', async () => {
    const posts = await prisma.blogPost.count({ where: { countryId: uaeId } });
    expect(posts).toBe(0);
    expect(
      await prisma.page.count({ where: { countryId: uaeId, slug: { startsWith: 'blog' } } }),
    ).toBe(0);
  });

  it('Test 8 — an edited copy is never overwritten', async () => {
    const page = await prisma.page.findFirstOrThrow({
      where: { countryId: uaeId, slug: pageSlug },
    });
    await prisma.page.update({
      where: { id: page.id },
      data: { title: 'Microsoft 365 UAE', seoTitle: 'Edited in the UAE' },
    });

    await sync();
    await sync();

    const after = await prisma.page.findUniqueOrThrow({ where: { id: page.id } });
    expect(after.title).toBe('Microsoft 365 UAE');
    expect(after.seoTitle).toBe('Edited in the UAE');
  });

  it('Test 3 — a page deleted here is not brought back by the next run', async () => {
    const copy = await prisma.page.findFirstOrThrow({
      where: { countryId: uaeId, slug: pageSlug },
    });
    await prisma.pageSection.deleteMany({ where: { pageId: copy.id } });
    await prisma.page.delete({ where: { id: copy.id } });

    // India still has it: deleting in one market touches nothing in another.
    expect(await prisma.page.count({ where: { id: indiaPageId } })).toBe(1);

    const result = await sync();
    expect(result.ok).toBe(true);
    expect(result.ok && result.data!.deletedLocally).toBeGreaterThan(0);

    // Still gone, because removing it here was a decision.
    expect(await prisma.page.count({ where: { countryId: uaeId, slug: pageSlug } })).toBe(0);

    // And the tombstone says why, so a later run reaches the same conclusion.
    const mapping = await prisma.countrySyncMapping.findFirstOrThrow({
      where: { targetCountryId: uaeId, entityType: 'PAGE', sourceId: indiaPageId },
    });
    expect(mapping.deletedInTargetAt).not.toBeNull();

    await sync();
    expect(await prisma.page.count({ where: { countryId: uaeId, slug: pageSlug } })).toBe(0);
  });

  it('Test 4 — a page deleted in India stays in the market it was synced to', async () => {
    const india = await prisma.page.create({
      data: {
        countryId: indiaId,
        title: `Source-deleted ${suffix}`,
        slug: secondSlug,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });

    await sync();
    const copy = await prisma.page.findFirstOrThrow({
      where: { countryId: uaeId, slug: secondSlug },
    });

    // India deletes it. Source absence is never a reason to touch a target.
    await prisma.page.update({ where: { id: india.id }, data: { deletedAt: new Date() } });

    const result = await sync();
    expect(result.ok).toBe(true);

    const after = await prisma.page.findUnique({ where: { id: copy.id } });
    expect(after).not.toBeNull();
    expect(after!.deletedAt).toBeNull();
  });

  it('a product withdrawn here is not re-offered by the next run', async () => {
    expect(await offersProduct(syncedProductId, uaeId)).toBe(true);

    await asMarket(uaeId, () => deleteProduct(syncedProductId));
    expect(await offersProduct(syncedProductId, uaeId)).toBe(false);

    const result = await sync();
    expect(result.ok).toBe(true);
    expect(await offersProduct(syncedProductId, uaeId)).toBe(false);
    // India keeps selling it throughout.
    expect(await offersProduct(syncedProductId, indiaId)).toBe(true);
  });

  it('still adds content India gains afterwards', async () => {
    const fresh = await prisma.page.create({
      data: {
        countryId: indiaId,
        title: `Google Workspace ${suffix}`,
        slug: `google-workspace-${suffix}`,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });

    const result = await sync();
    expect(result.ok).toBe(true);
    expect(result.ok && result.data!.created).toBeGreaterThan(0);

    expect(
      await prisma.page.count({ where: { countryId: uaeId, slug: `google-workspace-${suffix}` } }),
    ).toBe(1);

    // And the previously deleted one is still not back.
    expect(await prisma.page.count({ where: { countryId: uaeId, slug: pageSlug } })).toBe(0);
    void fresh;
  });

  it('refuses to treat a non-default market as a source', async () => {
    // The source is never taken from the caller, so there is no argument that
    // could ask for UAE → Qatar. Syncing a market into itself is the only way
    // to express it, and that is refused.
    const result = await syncCountryContent({ targetCountryId: indiaId });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/source market/i);
  });
});
