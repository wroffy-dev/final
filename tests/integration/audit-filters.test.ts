import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { buildAuditWhere } = await import('@/lib/admin/audit-query');

const suffix = uniqueSuffix();
const created: string[] = [];
let actorId = '';

/** Only ever counts the entries this file created. */
async function count(filters: Parameters<typeof buildAuditWhere>[0]) {
  return prisma.auditLog.count({
    where: { AND: [buildAuditWhere(filters), { id: { in: created } }] },
  });
}

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-audit' },
    update: {},
    create: { slug: 'test-role-audit', name: 'Test Role Audit', rank: 5 },
  });
  const actor = await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
  actorId = actor.id;

  // Four entries spread across action, entity, actor and date so every filter
  // has both a match and a non-match to distinguish.
  const rows = [
    {
      action: 'updated',
      entity: 'Lead',
      summary: `Lead alpha ${suffix}`,
      actorId,
      createdAt: new Date('2024-03-10T09:00:00'),
    },
    {
      action: 'created',
      entity: 'Lead',
      summary: `Lead beta ${suffix}`,
      actorId,
      createdAt: new Date('2024-03-20T09:00:00'),
    },
    {
      action: 'updated',
      entity: 'Page',
      summary: `Page gamma ${suffix}`,
      actorId,
      createdAt: new Date('2024-04-05T09:00:00'),
    },
    {
      action: 'deleted',
      entity: 'Product',
      summary: `Product delta ${suffix}`,
      actorId: null,
      actorEmail: 'system@example.test',
      createdAt: new Date('2024-04-15T09:00:00'),
    },
  ];

  for (const row of rows) {
    const entry = await prisma.auditLog.create({ data: row });
    created.push(entry.id);
  }
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { id: { in: created } } });
});

describe('audit log filters', () => {
  it('returns everything when nothing is applied', async () => {
    expect(await count({})).toBe(4);
  });

  it('filters by action', async () => {
    expect(await count({ action: 'updated' })).toBe(2);
    expect(await count({ action: 'created' })).toBe(1);
    expect(await count({ action: 'deleted' })).toBe(1);
    expect(await count({ action: 'exported' })).toBe(0);
  });

  it('filters by entity type', async () => {
    expect(await count({ entity: 'Lead' })).toBe(2);
    expect(await count({ entity: 'Page' })).toBe(1);
    expect(await count({ entity: 'Media' })).toBe(0);
  });

  it('filters by the person who made the change', async () => {
    expect(await count({ actor: actorId })).toBe(3);
    expect(await count({ actor: 'nobody' })).toBe(0);
  });

  it('filters by date, inclusive of both bounds', async () => {
    expect(await count({ from: '2024-04-01' })).toBe(2);
    expect(await count({ to: '2024-03-31' })).toBe(2);
    expect(await count({ from: '2024-03-20', to: '2024-04-05' })).toBe(2);
    // Both endpoints are whole days, so a single-day range still matches.
    expect(await count({ from: '2024-03-10', to: '2024-03-10' })).toBe(1);
    expect(await count({ from: '2030-01-01' })).toBe(0);
  });

  it('searches summary, action and actor email together', async () => {
    expect(await count({ q: 'alpha' })).toBe(1);
    expect(await count({ q: suffix })).toBe(4);
    expect(await count({ q: 'deleted' })).toBe(1);
    expect(await count({ q: 'system@example.test' })).toBe(1);
    expect(await count({ q: 'nothing-matches-this' })).toBe(0);
  });

  it('combines filters with AND rather than widening the result', async () => {
    expect(await count({ action: 'updated', entity: 'Lead' })).toBe(1);
    expect(await count({ action: 'updated', entity: 'Product' })).toBe(0);
    expect(await count({ entity: 'Lead', actor: actorId })).toBe(2);
    expect(await count({ entity: 'Lead', from: '2024-03-15' })).toBe(1);
    expect(await count({ q: suffix, action: 'updated', entity: 'Page', actor: actorId })).toBe(1);
    // Adding one more true-but-conflicting clause must drop it to nothing.
    expect(await count({ q: suffix, action: 'updated', entity: 'Page', from: '2024-05-01' })).toBe(
      0,
    );
  });

  it('ignores blank and whitespace-only search terms', async () => {
    expect(await count({ q: '' })).toBe(4);
    expect(await count({ q: '   ' })).toBe(4);
  });
});
