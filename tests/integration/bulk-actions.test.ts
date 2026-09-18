import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { bulkCustomerAction } = await import('@/lib/actions/customers');
const { bulkFormAction } = await import('@/lib/actions/forms');

const suffix = uniqueSuffix();
const customerIds: string[] = [];
const formIds: string[] = [];
let ownerId = '';

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-bulk' },
    update: {},
    create: { slug: 'test-role-bulk', name: 'Test Role Bulk', rank: 5 },
  });
  const owner = await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
  ownerId = owner.id;
});

beforeEach(async () => {
  // Fresh rows per test, so one test's writes cannot mask another's.
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.formField.deleteMany({ where: { formId: { in: formIds } } });
  await prisma.form.deleteMany({ where: { id: { in: formIds } } });
  customerIds.length = 0;
  formIds.length = 0;

  for (let i = 0; i < 3; i += 1) {
    const customer = await prisma.customer.create({
      data: {
        name: `Bulk customer ${i} ${suffix}`,
        email: `bulk-c-${i}-${suffix}@example.test`,
        status: 'PROSPECT',
        assignedToId: ownerId,
      },
    });
    customerIds.push(customer.id);

    const form = await prisma.form.create({
      data: { name: `Bulk form ${i} ${suffix}`, slug: `bulk-form-${i}-${suffix}`, isActive: true },
    });
    formIds.push(form.id);
  }
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.formField.deleteMany({ where: { formId: { in: formIds } } });
  await prisma.form.deleteMany({ where: { id: { in: formIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-bulk' } });
  await prisma.$disconnect();
});

describe('bulk customer actions', () => {
  it('sets a status on every selected customer', async () => {
    const result = await bulkCustomerAction({
      ids: customerIds,
      action: 'status',
      status: 'ACTIVE',
    });
    expect(result.ok).toBe(true);

    const rows = await prisma.customer.findMany({ where: { id: { in: customerIds } } });
    expect(rows.every((row) => row.status === 'ACTIVE')).toBe(true);
  });

  it('touches only the ids it was given', async () => {
    await bulkCustomerAction({ ids: [customerIds[0]], action: 'status', status: 'FORMER' });

    const rows = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows[0].status).toBe('FORMER');
    expect(rows[1].status).toBe('PROSPECT');
    expect(rows[2].status).toBe('PROSPECT');
  });

  it('assigns and unassigns an owner', async () => {
    await bulkCustomerAction({ ids: customerIds, action: 'unassign' });
    let rows = await prisma.customer.findMany({ where: { id: { in: customerIds } } });
    expect(rows.every((row) => row.assignedToId === null)).toBe(true);

    await bulkCustomerAction({ ids: customerIds, action: 'assign', assignedToId: ownerId });
    rows = await prisma.customer.findMany({ where: { id: { in: customerIds } } });
    expect(rows.every((row) => row.assignedToId === ownerId)).toBe(true);
  });

  it('soft-deletes rather than destroying', async () => {
    await bulkCustomerAction({ ids: customerIds, action: 'delete' });

    // Still present in the table, just hidden from every query that filters
    // on deletedAt — so linked leads keep their customer.
    expect(await prisma.customer.count({ where: { id: { in: customerIds } } })).toBe(3);
    expect(
      await prisma.customer.count({ where: { id: { in: customerIds }, deletedAt: null } }),
    ).toBe(0);
  });

  it('rejects a payload that does not say what to apply', async () => {
    expect((await bulkCustomerAction({ ids: customerIds, action: 'status' })).ok).toBe(false);
    expect(
      (await bulkCustomerAction({ ids: customerIds, action: 'status', status: 'NONSENSE' })).ok,
    ).toBe(false);
    expect((await bulkCustomerAction({ ids: customerIds, action: 'assign' })).ok).toBe(false);
    expect(
      (await bulkCustomerAction({ ids: customerIds, action: 'assign', assignedToId: 'nobody' })).ok,
    ).toBe(false);

    // And none of those rejections changed anything.
    const rows = await prisma.customer.findMany({ where: { id: { in: customerIds } } });
    expect(rows.every((row) => row.status === 'PROSPECT')).toBe(true);
  });

  it('rejects a malformed selection', async () => {
    expect((await bulkCustomerAction({ ids: [], action: 'unassign' })).ok).toBe(false);
    expect((await bulkCustomerAction({ ids: customerIds, action: 'explode' })).ok).toBe(false);
    // Over the cap, so one request cannot rewrite the whole table.
    const tooMany = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    expect((await bulkCustomerAction({ ids: tooMany, action: 'unassign' })).ok).toBe(false);
  });

  it('records one audit entry naming what happened', async () => {
    await bulkCustomerAction({ ids: customerIds, action: 'status', status: 'ACTIVE' });
    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'Customer', action: 'bulk.status' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.summary).toContain('3 customer(s)');
  });
});

describe('bulk form actions', () => {
  it('activates and deactivates', async () => {
    await bulkFormAction({ ids: formIds, action: 'deactivate' });
    let rows = await prisma.form.findMany({ where: { id: { in: formIds } } });
    expect(rows.every((row) => row.isActive === false)).toBe(true);

    await bulkFormAction({ ids: formIds, action: 'activate' });
    rows = await prisma.form.findMany({ where: { id: { in: formIds } } });
    expect(rows.every((row) => row.isActive === true)).toBe(true);
  });

  it('turns the CAPTCHA on and off across a selection', async () => {
    await bulkFormAction({ ids: formIds, action: 'captchaOn' });
    let rows = await prisma.form.findMany({ where: { id: { in: formIds } } });
    expect(rows.every((row) => row.requireCaptcha)).toBe(true);

    await bulkFormAction({ ids: formIds, action: 'captchaOff' });
    rows = await prisma.form.findMany({ where: { id: { in: formIds } } });
    expect(rows.every((row) => row.requireCaptcha === false)).toBe(true);
  });

  it('soft-deletes and frees each slug for reuse', async () => {
    const before = await prisma.form.findMany({
      where: { id: { in: formIds } },
      select: { id: true, slug: true },
    });

    await bulkFormAction({ ids: formIds, action: 'delete' });

    const after = await prisma.form.findMany({ where: { id: { in: formIds } } });
    expect(after.every((row) => row.deletedAt !== null)).toBe(true);
    expect(after.every((row) => row.isActive === false)).toBe(true);
    // The original slug is released, so a new form can take the name.
    for (const original of before) {
      const row = after.find((candidate) => candidate.id === original.id)!;
      expect(row.slug).not.toBe(original.slug);
      expect(row.slug.startsWith(`${original.slug}-deleted-`)).toBe(true);
    }
  });

  it('ignores ids that are already deleted', async () => {
    await bulkFormAction({ ids: formIds, action: 'delete' });
    // A second pass finds nothing live and says so rather than half-working.
    const second = await bulkFormAction({ ids: formIds, action: 'activate' });
    expect(second.ok).toBe(false);
  });

  it('rejects a malformed selection', async () => {
    expect((await bulkFormAction({ ids: [], action: 'activate' })).ok).toBe(false);
    expect((await bulkFormAction({ ids: formIds, action: 'explode' })).ok).toBe(false);
  });
});
