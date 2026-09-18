import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR, ensureTestCountry, testCountryContext } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const {
  createProduct,
  updateProduct,
  setProductStatus,
  toggleProductFeatured,
  duplicateProduct,
  deleteProduct,
  bulkProductAction,
} = await import('@/lib/actions/products');
const { selectProducts, getPublicProduct } = await import('@/lib/services/products');

const suffix = uniqueSuffix();
const created: string[] = [];

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-products' },
    update: {},
    create: { slug: 'test-role-products', name: 'Test Role Products', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-products' } });
  await prisma.$disconnect();
});

describe('product lifecycle', () => {
  let productId = '';

  it('creates a product and stores prices as Decimal', async () => {
    const result = await createProduct(
      formData({
        name: `Test Plan ${suffix}`,
        slug: '',
        status: 'DRAFT',
        currency: 'INR',
        monthlyPrice: '1250.55',
        annualPrice: '12500.00',
        storage: '5 TB',
        minUsers: '3',
        maxUsers: '250',
        features: ['Feature one', 'Feature two'],
        benefits: ['Benefit one'],
        specs: [{ label: 'Storage', value: '5 TB' }],
        ctaLabel: 'Get Started',
      }),
    );
    expect(result.ok).toBe(true);
    productId = (result as { data: { id: string } }).data.id;
    created.push(productId);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.monthlyPrice?.toString()).toBe('1250.55');
    expect(product.annualPrice?.toString()).toBe('12500');
    expect(product.slug).toBe(`test-plan-${suffix}`);
    expect(product.features).toEqual(['Feature one', 'Feature two']);
  });

  it('rejects a malformed price', async () => {
    const result = await createProduct(
      formData({ name: `Bad price ${suffix}`, monthlyPrice: 'twelve pounds' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.monthlyPrice).toBeTruthy();
  });

  it('rejects a maximum below the minimum user count', async () => {
    const result = await createProduct(
      formData({ name: `Bad range ${suffix}`, minUsers: '100', maxUsers: '10' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.maxUsers).toBeTruthy();
  });

  it('sanitises HTML in the description', async () => {
    const result = await updateProduct(
      productId,
      formData({
        name: `Test Plan ${suffix}`,
        slug: `test-plan-${suffix}`,
        description: '<p>Safe</p><script>alert(1)</script>',
        monthlyPrice: '1250.55',
        // The admin form always submits the whole record, so the test does too.
        features: ['Feature one', 'Feature two'],
        benefits: ['Benefit one'],
      }),
    );
    expect(result.ok).toBe(true);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.description).toContain('<p>Safe</p>');
    expect(product.description).not.toContain('script');
  });

  it('keeps a draft product off the public site', async () => {
    expect(await getPublicProduct(testCountryContext(), `test-plan-${suffix}`)).toBeNull();
  });

  it('publishes the product and exposes it publicly', async () => {
    expect((await setProductStatus(productId, 'PUBLISHED')).ok).toBe(true);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.status).toBe('PUBLISHED');
    expect(product.publishedAt).not.toBeNull();
  });

  it('includes the product in the featured selection once flagged', async () => {
    await toggleProductFeatured(productId);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).isFeatured).toBe(true);

    const featured = await selectProducts(testCountryContext(), { source: 'selected', productIds: [productId], limit: 5 });
    expect(featured).toHaveLength(1);
    expect(featured[0]!.monthlyPrice).toBe('1250.55');
    expect(featured[0]!.features).toEqual(['Feature one', 'Feature two']);
  });

  it('preserves hand-picked product order', async () => {
    const second = await createProduct(formData({ name: `Second Plan ${suffix}`, status: 'PUBLISHED' }));
    const secondId = (second as { data: { id: string } }).data.id;
    created.push(secondId);

    const ordered = await selectProducts(testCountryContext(), { source: 'selected', productIds: [secondId, productId], limit: 5 });
    expect(ordered.map((p) => p.id)).toEqual([secondId, productId]);
  });

  it('duplicates a product as an unfeatured draft', async () => {
    const result = await duplicateProduct(productId);
    expect(result.ok).toBe(true);
    const copyId = (result as { data: { id: string } }).data.id;
    created.push(copyId);

    const copy = await prisma.product.findUniqueOrThrow({ where: { id: copyId } });
    expect(copy.status).toBe('DRAFT');
    expect(copy.isFeatured).toBe(false);
    expect(copy.monthlyPrice?.toString()).toBe('1250.55');
    expect(copy.slug).not.toBe(`test-plan-${suffix}`);
  });

  it('applies a bulk status change', async () => {
    const result = await bulkProductAction({ ids: created.slice(0, 2), action: 'draft' });
    expect(result.ok).toBe(true);
    const rows = await prisma.product.findMany({ where: { id: { in: created.slice(0, 2) } } });
    expect(rows.every((r) => r.status === 'DRAFT')).toBe(true);
  });

  it('soft-deletes a product and hides it from the public site', async () => {
    await setProductStatus(productId, 'PUBLISHED');
    expect((await deleteProduct(productId)).ok).toBe(true);

    const row = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.isFeatured).toBe(false);

    const selected = await selectProducts(testCountryContext(), { source: 'selected', productIds: [productId], limit: 5 });
    expect(selected).toHaveLength(0);
  });
});

describe('product authorisation', () => {
  it('refuses to create a product without products.create', async () => {
    // vi.doMock only affects modules imported after it, so the registry must be
    // reset before the action is re-imported with the restricted actor.
    vi.resetModules();
    const { mockAuth: restrictedAuth } = await import('../helpers');
    restrictedAuth(['products.view'], 'sales');

    const restricted = await import('@/lib/actions/products');
    const blockedName = `Blocked ${suffix}`;
    const result = await restricted.createProduct(formData({ name: blockedName }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/permission/i);
    expect(await prisma.product.count({ where: { name: blockedName } })).toBe(0);
  });
});
