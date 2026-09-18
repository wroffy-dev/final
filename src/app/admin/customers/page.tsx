import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import { daysAgo, type FilterDefinition, type FilterPreset } from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { CustomersTable, type CustomerRow } from '@/components/admin/customers/customers-table';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { CUSTOMER_STATUS_LABELS } from '@/lib/crm/constants';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 25;

export default async function CustomersAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    assignedTo?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission('customers.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.CustomerWhereInput = { deletedAt: null };
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { company: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.CustomerWhereInput['status'];
  if (params.assignedTo === 'unassigned') where.assignedToId = null;
  else if (params.assignedTo) where.assignedToId = params.assignedTo;
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: new Date(`${params.from}T00:00:00`) } : {}),
      ...(params.to ? { lte: new Date(`${params.to}T23:59:59.999`) } : {}),
    };
  }

  const [rows, total, staff] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        reference: true,
        name: true,
        company: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
        _count: { select: { products: true, leads: true } },
      },
    }),
    prisma.customer.count({ where }),
    prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const tableRows: CustomerRow[] = rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    status: row.status,
    assignedToName: row.assignedTo?.name ?? null,
    productCount: row._count.products,
    leadCount: row._count.leads,
    createdAt: row.createdAt.toISOString(),
  }));

  const definitions: FilterDefinition[] = [
    {
      name: 'status',
      label: 'Status',
      allLabel: 'Any status',
      options: Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => ({
        label,
        value,
      })),
    },
    {
      name: 'assignedTo',
      label: 'Owner',
      allLabel: 'Anyone',
      options: [
        { label: 'Unassigned', value: 'unassigned' },
        ...staff.map((member) => ({ label: member.name, value: member.id })),
      ],
    },
    { name: 'date', label: 'Added', kind: 'date' },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'All customers', params: {} },
    { id: 'active', label: 'Active', params: { status: 'ACTIVE' } },
    {
      id: 'unassigned',
      label: 'Unassigned',
      params: { assignedTo: 'unassigned' },
    },
    { id: 'recent', label: 'Added in 30 days', params: { from: daysAgo(30) } },
  ];

  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="Accounts you have won, with the products they hold and their lead history."
        crumbs={[{ label: 'Customers' }]}
        actions={
          userCan(user, 'customers.create') ? (
            <ButtonLink href="/admin/customers/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New customer
            </ButtonLink>
          ) : null
        }
      />

      <FilterBar
        searchPlaceholder="Search by name, company or email"
        definitions={definitions}
        presets={presets}
      />

      <Card>
        <CustomersTable
          rows={tableRows}
          can={{
            edit: userCan(user, 'customers.edit'),
            create: userCan(user, 'customers.create'),
            delete: userCan(user, 'customers.delete'),
          }}
          filtered={Boolean(
            params.q || params.status || params.assignedTo || params.from || params.to,
          )}
        />
        {tableRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/customers"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
