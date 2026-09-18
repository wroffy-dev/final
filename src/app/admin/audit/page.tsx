import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import { buildAuditWhere } from '@/lib/admin/audit-query';
import {
  daysAgo,
  today,
  startOfWeek,
  type FilterDefinition,
  type FilterPreset,
} from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { AuditTable, type AuditRow } from '@/components/admin/audit-table';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 40;

export default async function AuditAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    entity?: string;
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requirePermission('audit.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where = buildAuditWhere(params);

  const [rows, total, entities, actions, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        actorEmail: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      _count: { _all: true },
      orderBy: { entity: 'asc' },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      _count: { _all: true },
      orderBy: { action: 'asc' },
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const auditRows: AuditRow[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    summary: row.summary,
    actorName: row.actor?.name ?? null,
    actorEmail: row.actorEmail,
    before: row.before ? JSON.stringify(row.before, null, 2) : null,
    after: row.after ? JSON.stringify(row.after, null, 2) : null,
    createdAt: row.createdAt.toISOString(),
  }));

  const definitions: FilterDefinition[] = [
    {
      name: 'actor',
      label: 'Person',
      allLabel: 'Anyone',
      options: actors.map((actor) => ({ label: actor.name, value: actor.id })),
    },
    {
      name: 'action',
      label: 'Action',
      allLabel: 'Any action',
      options: actions.map((row) => ({
        label: `${row.action} (${row._count._all})`,
        value: row.action,
      })),
    },
    {
      name: 'entity',
      label: 'Type',
      allLabel: 'Any type',
      options: entities.map((row) => ({
        label: `${row.entity} (${row._count._all})`,
        value: row.entity,
      })),
    },
    { name: 'date', label: 'Date', kind: 'date' },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'Everything', params: {} },
    { id: 'today', label: 'Today', params: { from: today() } },
    { id: 'week', label: 'This week', params: { from: startOfWeek() } },
    { id: 'month', label: 'Last 30 days', params: { from: daysAgo(30) } },
    { id: 'deletions', label: 'Deletions', params: { action: 'deleted' } },
  ];

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every change made in the admin, with who made it and what changed."
        crumbs={[{ label: 'Audit log' }]}
      />

      <FilterBar
        searchPlaceholder="Search by summary, action or email"
        definitions={definitions}
        presets={presets}
      />

      <Card>
        <AuditTable
          rows={auditRows}
          filtered={Boolean(
            params.q || params.entity || params.actor || params.action || params.from || params.to,
          )}
        />
        {auditRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/audit"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
