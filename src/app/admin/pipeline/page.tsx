import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { buildLeadWhere } from '@/lib/crm/query';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import {
  daysAgo,
  startOfWeek,
  type FilterDefinition,
  type FilterPreset,
} from '@/lib/admin/filters';
import { PipelineBoard, type PipelineCard } from '@/components/admin/leads/pipeline-board';
import { Alert } from '@/components/ui/states';
import { decimalToString } from '@/lib/utils/money';
import { resolveListCountry, countryFilterDefinition } from '@/lib/admin/country-filter';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Pipeline' };
export const dynamic = 'force-dynamic';

const MAX_CARDS = 300;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    assignedTo?: string;
    productId?: string;
    source?: string;
    country?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requirePermission('leads.view');
  const params = await searchParams;

  // The board follows the market chosen in the topbar, so a market's sales team
  // works their own pipeline rather than a merged one.
  const country = await resolveListCountry(user, params.country);

  // Spam never appears on the board.
  const where: Prisma.LeadWhereInput = {
    ...buildLeadWhere({ ...params, countryId: country.countryId ?? undefined }),
    status: { notIn: ['SPAM'] },
  };

  const [leads, staff, products, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ pipelineOrder: 'asc' }, { createdAt: 'desc' }],
      take: MAX_CARDS,
      select: {
        id: true,
        reference: true,
        name: true,
        company: true,
        status: true,
        value: true,
        createdAt: true,
        followUpAt: true,
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.lead.count({ where }),
  ]);

  const cards: PipelineCard[] = leads.map((lead) => ({
    id: lead.id,
    reference: lead.reference,
    name: lead.name,
    company: lead.company,
    productName: lead.product?.name ?? null,
    assignedToName: lead.assignedTo?.name ?? null,
    value: decimalToString(lead.value),
    status: lead.status,
    createdAt: lead.createdAt.toISOString(),
    followUpAt: lead.followUpAt?.toISOString() ?? null,
  }));

  const definitions: FilterDefinition[] = [
    ...countryFilterDefinition(country),
    {
      name: 'assignedTo',
      label: 'Owner',
      allLabel: 'Anyone',
      options: [
        { label: 'Unassigned', value: 'unassigned' },
        ...staff.map((member) => ({ label: member.name, value: member.id })),
      ],
    },
    {
      name: 'productId',
      label: 'Product',
      allLabel: 'Any product',
      options: products.map((product) => ({
        label: product.name,
        value: product.id,
      })),
    },
    { name: 'date', label: 'Created', kind: 'date' },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'Whole pipeline', params: {} },
    { id: 'mine', label: 'My leads', params: { assignedTo: user.id } },
    {
      id: 'unassigned',
      label: 'Unassigned',
      params: { assignedTo: 'unassigned' },
    },
    { id: 'week', label: 'This week', params: { from: startOfWeek() } },
    { id: 'month', label: 'Last 30 days', params: { from: daysAgo(30) } },
  ];

  return (
    <>
      <AdminPageHeader
        title="Pipeline"
        description="Drag a lead between stages to update it. Changes are recorded on the lead's timeline."
        crumbs={[{ label: 'Pipeline' }]}
      />

      <FilterBar searchPlaceholder="Search leads" definitions={definitions} presets={presets} />

      {total > MAX_CARDS ? (
        <Alert tone="info" className="mb-4">
          Showing the {MAX_CARDS} most recent of {total} leads. Narrow the filters to see the rest.
        </Alert>
      ) : null}

      <PipelineBoard cards={cards} canEdit={userCan(user, 'leads.edit')} />
    </>
  );
}
