import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, TEST_ACTOR, ensureTestCountry, testCountryContext } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const {
  addProductSection,
  updateProductSection,
  duplicateProductSection,
  deleteProductSection,
  reorderProductSections,
  toggleProductSectionVisibility,
} = await import('@/lib/actions/product-sections');
const { getProductSections } = await import('@/lib/services/products');
const { localiseContent } = await import('@/lib/country/routing');

const suffix = uniqueSuffix();
let productId = '';

beforeAll(async () => {
  await ensureTestCountry();
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-product-sections' },
    update: {},
    create: { slug: 'test-role-product-sections', name: 'Test Role Product Sections', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });

  const product = await prisma.product.create({
    data: { name: `Sections Plan ${suffix}`, slug: `sections-plan-${suffix}`, status: 'PUBLISHED' },
  });
  productId = product.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-product-sections' } });
  await prisma.$disconnect();
});

describe('a product builds its page from sections', () => {
  it('adds a section from the block registry and orders it last', async () => {
    const first = await addProductSection(productId, 'richText');
    expect(first.ok, first.ok === false ? first.error : '').toBe(true);

    const second = await addProductSection(productId, 'faq');
    expect(second.ok, second.ok === false ? second.error : '').toBe(true);

    const sections = await getProductSections(productId);
    expect(sections.map((s) => s.blockType)).toEqual(['richText', 'faq']);
    // A new section is visible and carries the block's own defaults.
    expect(sections.every((s) => s.isVisible)).toBe(true);
    expect(sections[0]?.sortOrder).toBeLessThan(sections[1]?.sortOrder ?? 0);
  });

  it('refuses a block type that is not in the registry', async () => {
    const result = await addProductSection(productId, 'notARealBlock');
    expect(result.ok).toBe(false);
  });

  it('validates saved content against the block schema', async () => {
    const sections = await getProductSections(productId);
    const richText = sections.find((s) => s.blockType === 'richText');
    expect(richText).toBeDefined();

    const result = await updateProductSection(richText!.id, {
      name: 'Why this plan',
      content: {
        heading: 'Why this plan',
        content: '<p>Twelve months of support included.</p>',
        // Not part of the block's schema, so it must not survive the save.
        smuggled: 'should be dropped',
      },
    });
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const stored = await prisma.productSection.findUniqueOrThrow({ where: { id: richText!.id } });
    expect(stored.name).toBe('Why this plan');
    expect(JSON.stringify(stored.content)).toContain('Twelve months of support');
    expect(JSON.stringify(stored.content)).not.toContain('smuggled');
  });

  it('keeps anchors unique within one product', async () => {
    const sections = await getProductSections(productId);
    const [one, two] = sections;

    const first = await updateProductSection(one!.id, { settings: { anchorId: 'details' } });
    expect(first.ok, first.ok === false ? first.error : '').toBe(true);

    // The same anchor twice would produce two elements sharing one DOM id.
    const clash = await updateProductSection(two!.id, { settings: { anchorId: 'details' } });
    expect(clash.ok).toBe(false);
  });

  it('duplicates a section without copying its anchor', async () => {
    const sections = await getProductSections(productId);
    const source = sections.find((s) => s.blockType === 'richText');

    const result = await duplicateProductSection(source!.id);
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);
    if (!result.ok || !result.data) throw new Error('duplicate returned no id');

    const copy = await prisma.productSection.findUniqueOrThrow({
      where: { id: result.data.id },
    });
    expect(copy.blockType).toBe('richText');
    expect((copy.settings as { anchorId?: string }).anchorId).toBe('');
    expect(copy.name).toContain('(copy)');
  });

  it('reorders, hides and removes sections', async () => {
    const before = await getProductSections(productId);
    const reversed = [...before].reverse().map((s) => s.id);

    const reorder = await reorderProductSections({ productId, order: reversed });
    expect(reorder.ok, reorder.ok === false ? reorder.error : '').toBe(true);
    const after = await getProductSections(productId);
    expect(after.map((s) => s.id)).toEqual(reversed);

    const hidden = await toggleProductSectionVisibility(reversed[0]!);
    expect(hidden.ok).toBe(true);
    const hiddenRow = await prisma.productSection.findUniqueOrThrow({ where: { id: reversed[0]! } });
    expect(hiddenRow.isVisible).toBe(false);

    const removed = await deleteProductSection(reversed[0]!);
    expect(removed.ok).toBe(true);
    const remaining = await getProductSections(productId);
    expect(remaining.some((s) => s.id === reversed[0])).toBe(false);
  });

  it('rejects an order containing a section from another product', async () => {
    const other = await prisma.product.create({
      data: { name: `Other Plan ${suffix}`, slug: `other-plan-${suffix}` },
    });
    const foreign = await prisma.productSection.create({
      data: { productId: other.id, blockType: 'richText', sortOrder: 10 },
    });

    const mine = await getProductSections(productId);
    const result = await reorderProductSections({
      productId,
      order: [...mine.map((s) => s.id), foreign.id],
    });
    expect(result.ok).toBe(false);

    await prisma.product.delete({ where: { id: other.id } });
  });

  it('removes a product’s sections with the product', async () => {
    const doomed = await prisma.product.create({
      data: { name: `Doomed Plan ${suffix}`, slug: `doomed-plan-${suffix}` },
    });
    await prisma.productSection.create({
      data: { productId: doomed.id, blockType: 'richText', sortOrder: 10 },
    });

    await prisma.product.delete({ where: { id: doomed.id } });
    const orphans = await prisma.productSection.count({ where: { productId: doomed.id } });
    expect(orphans).toBe(0);
  });
});

/*
 * The reason product sections can be global at all.
 *
 * One stored section is rendered in every market, so the links inside it have
 * to come out carrying the market's own prefix. That rewriting is what makes a
 * single set of content correct everywhere — without it, a section written for
 * India would send UAE visitors back to India, which is exactly the failure
 * this arrangement is meant to avoid.
 */
describe('a global section still links inside the market it renders in', () => {
  const india = testCountryContext();
  const uae = testCountryContext({
    id: 'country_ae',
    name: 'United Arab Emirates',
    code: 'AE',
    slug: 'ae',
    isDefault: false,
  });

  it('prefixes internal links for a non-default market and leaves the root market alone', () => {
    const content = {
      heading: 'Compare the plans',
      ctaUrl: '/pricing',
      body: '<p>Read the <a href="/contact">contact</a> page.</p>',
    };

    const forIndia = localiseContent(content, india) as typeof content;
    expect(forIndia.ctaUrl).toBe('/pricing');
    expect(forIndia.body).toContain('href="/contact"');

    const forUae = localiseContent(content, uae) as typeof content;
    expect(forUae.ctaUrl).toBe('/ae/pricing');
    expect(forUae.body).toContain('href="/ae/contact"');
  });

  it('leaves external URLs, anchors and system routes untouched', () => {
    const content = {
      external: 'https://dropbox.com/pricing',
      anchor: '#features',
      system: '/admin/products',
      blog: '/blog/announcing-x',
    };

    const forUae = localiseContent(content, uae) as typeof content;
    expect(forUae.external).toBe('https://dropbox.com/pricing');
    expect(forUae.anchor).toBe('#features');
    expect(forUae.system).toBe('/admin/products');
    // Articles live at the site root, so a market never gets its own copy.
    expect(forUae.blog).toBe('/blog/announcing-x');
  });
});
