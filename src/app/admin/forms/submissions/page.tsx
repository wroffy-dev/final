import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { Card } from '@/components/ui/card';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, truncate } from '@/lib/utils/format';
import type { FilterDefinition } from '@/lib/admin/filters';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Submissions' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 30;

type SearchParams = {
  q?: string;
  formId?: string;
  linked?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** A readable one-line summary of whatever the visitor filled in. */
function summarise(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '—';
  const entries = Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .slice(0, 4);
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
}

export default async function SubmissionsAdmin({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('forms.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.FormSubmissionWhereInput = {};
  if (params.formId) where.formId = params.formId;
  if (params.linked === 'yes') where.leadId = { not: null };
  if (params.linked === 'no') where.leadId = null;
  if (params.from || params.to) {
    const range: Prisma.DateTimeFilter = {};
    if (params.from) range.gte = new Date(params.from);
    if (params.to) {
      const to = new Date(params.to);
      to.setHours(23, 59, 59, 999);
      range.lte = to;
    }
    where.createdAt = range;
  }
  // Submission payloads are JSON, so free text is matched against the page the
  // form was on and the lead it produced rather than every stored key.
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { pageUrl: { contains: q, mode: 'insensitive' } },
      { lead: { name: { contains: q, mode: 'insensitive' } } },
      { lead: { email: { contains: q, mode: 'insensitive' } } },
      { lead: { company: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [rows, total, forms] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        data: true,
        createdAt: true,
        pageUrl: true,
        leadId: true,
        form: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, status: true } },
      },
    }),
    prisma.formSubmission.count({ where }),
    prisma.form.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        _count: { select: { submissions: true } },
      },
    }),
  ]);

  const definitions: FilterDefinition[] = [
    {
      name: 'formId',
      label: 'Form',
      allLabel: 'All forms',
      options: forms.map((form) => ({
        label: form.name,
        value: form.id,
        hint: String(form._count.submissions),
      })),
    },
    {
      name: 'linked',
      label: 'Lead',
      allLabel: 'All submissions',
      options: [
        { label: 'Created a lead', value: 'yes' },
        { label: 'No lead', value: 'no' },
      ],
    },
    { name: 'from', label: 'Date range', kind: 'date' },
  ];

  const filtered = Boolean(params.q || params.formId || params.linked || params.from || params.to);

  return (
    <>
      <AdminPageHeader
        title="Submissions"
        description="Everything visitors have submitted through your forms, newest first."
        actions={
          <ButtonLink href="/admin/forms" variant="outline">
            Manage forms
          </ButtonLink>
        }
      />

      <FilterBar searchPlaceholder="Search by lead name, email or page" definitions={definitions} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title={filtered ? 'No submissions match these filters' : 'No submissions yet'}
            description={
              filtered
                ? 'Try clearing a filter to widen the search.'
                : 'When someone fills in a form on your website, their answers appear here.'
            }
            action={
              filtered ? (
                <ButtonLink href="/admin/forms/submissions" variant="outline">
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/admin/forms">Set up a form</ButtonLink>
              )
            }
          />
        ) : (
          <>
            <div className="border-b border-hairline px-4 py-3 text-sm text-muted sm:px-5">
              <span className="font-medium text-content">{total.toLocaleString()}</span>{' '}
              {total === 1 ? 'submission' : 'submissions'}
              {filtered ? ' matching' : ''}
            </div>

            <TableWrap className="hidden md:block">
              <Table className="min-w-[52rem]">
                <caption className="sr-only">Form submissions</caption>
                <thead>
                  <tr>
                    <Th>Form</Th>
                    <Th>Submitted values</Th>
                    <Th>Lead</Th>
                    <Th>Page</Th>
                    <Th>Received</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <Link
                          href={`/admin/forms/${row.form.id}`}
                          className="font-medium text-content hover:text-brand"
                        >
                          {row.form.name}
                        </Link>
                      </Td>
                      <Td className="max-w-[22rem] text-sm text-muted">
                        <span className="block truncate" title={summarise(row.data)}>
                          {truncate(summarise(row.data), 90)}
                        </span>
                      </Td>
                      <Td>
                        {row.lead ? (
                          <Link
                            href={`/admin/leads/${row.lead.id}`}
                            className="text-sm font-medium text-brand hover:underline"
                          >
                            {row.lead.name}
                          </Link>
                        ) : (
                          <Badge tone="neutral">No lead</Badge>
                        )}
                      </Td>
                      <Td className="max-w-[14rem] text-sm text-muted">
                        <span className="block truncate" title={row.pageUrl ?? undefined}>
                          {row.pageUrl ?? '—'}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-muted">
                        {formatDate(row.createdAt)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            <ul className="divide-y divide-hairline md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/forms/${row.form.id}`}
                      className="truncate text-sm font-medium text-content"
                    >
                      {row.form.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{formatDate(row.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{summarise(row.data)}</p>
                  {row.lead ? (
                    <Link
                      href={`/admin/leads/${row.lead.id}`}
                      className="mt-1.5 inline-block text-xs font-medium text-brand"
                    >
                      View lead: {row.lead.name}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>

            <AdminPagination
              page={page}
              pages={Math.max(1, Math.ceil(total / PER_PAGE))}
              total={total}
              basePath="/admin/forms/submissions"
              params={params as Record<string, string | undefined>}
            />
          </>
        )}
      </Card>
    </>
  );
}
