'use client';

import * as React from 'react';
import Link from 'next/link';
import { ScrollText, ChevronDown, ExternalLink } from 'lucide-react';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { entityHref } from '@/lib/admin/audit-links';

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  actorName: string | null;
  actorEmail: string | null;
  before: string | null;
  after: string | null;
  createdAt: string;
};

function actionTone(action: string): BadgeTone {
  if (action.startsWith('deleted') || action.includes('delete')) return 'danger';
  if (action.startsWith('created') || action === 'published') return 'success';
  if (action.startsWith('bulk')) return 'warning';
  if (action === 'exported') return 'purple';
  return 'neutral';
}

export function AuditTable({ rows, filtered }: { rows: AuditRow[]; filtered: boolean }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="h-5 w-5" />}
        title={filtered ? 'No entries match those filters' : 'Nothing recorded yet'}
        description={
          filtered
            ? 'Try clearing the search or filters.'
            : 'Changes made in the admin will be listed here.'
        }
      />
    );
  }

  return (
    <TableWrap>
      <Table className="min-w-[46rem]">
        <caption className="sr-only">Audit log</caption>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>What changed</Th>
            <Th align="right">Detail</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasDetail = Boolean(row.before || row.after);
            const isOpen = expanded === row.id;
            return (
              <React.Fragment key={row.id}>
                <Tr>
                  <Td className="whitespace-nowrap text-sm text-muted">
                    {formatDate(row.createdAt, true)}
                  </Td>
                  <Td className="text-sm">
                    <span className="block text-content">{row.actorName ?? 'System'}</span>
                    {row.actorEmail ? (
                      <span className="block truncate text-xs text-muted">{row.actorEmail}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={actionTone(row.action)}>{row.action}</Badge>
                      <span className="text-xs text-muted">{row.entity}</span>
                    </span>
                  </Td>
                  <Td className="text-sm text-content">
                    {(() => {
                      const href = entityHref(row.entity, row.entityId);
                      const label = row.summary ?? '—';
                      if (!href) return label;
                      return (
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1 rounded text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                        >
                          {label}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </Link>
                      );
                    })()}
                  </Td>
                  <Td align="right">
                    {hasDetail ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : row.id)}
                        aria-expanded={isOpen}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-muted/10 hover:text-content"
                      >
                        {isOpen ? 'Hide' : 'Show'}
                        <ChevronDown
                          className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </Td>
                </Tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={5} className="border-b border-hairline bg-muted/[0.03] px-4 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {row.before ? (
                          <div>
                            <p className="mb-1 text-xs font-semibold text-muted">Before</p>
                            <pre className="scroll-x max-h-56 rounded-lg bg-surface p-3 font-mono text-[0.6875rem] text-content">
                              {row.before}
                            </pre>
                          </div>
                        ) : null}
                        {row.after ? (
                          <div>
                            <p className="mb-1 text-xs font-semibold text-muted">After</p>
                            <pre className="scroll-x max-h-56 rounded-lg bg-surface p-3 font-mono text-[0.6875rem] text-content">
                              {row.after}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
