'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Download, Trash, UserPlus, ExternalLink, Mail, Phone, Clock } from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import { bulkLeadAction, exportLeads } from '@/lib/actions/leads';
import { RowMenu, RowMenuItem, BulkBar, useSelection } from '@/components/admin/row-menu';
import { LeadStatusBadge } from '@/components/admin/status-badge';
import { SortableTh } from '@/components/admin/sortable-th';
import { Table, TableWrap, StickyThead, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Button, ButtonLink } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { LEAD_STATUS_OPTIONS } from '@/lib/crm/constants';
import { formatRelative } from '@/lib/utils/format';
import { formatMoney } from '@/lib/utils/money';
import { downloadCsv } from '@/lib/utils/download';
import { cn } from '@/lib/utils/cn';
import {
  CONSENT_DISPLAY_LABELS,
  type ConsentDisplayState,
} from '@/lib/privacy/consent';

export type LeadRow = {
  id: string;
  reference: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  /** The storefront this lead came from. */
  countryName: string;
  /**
   * How this lead's consent reads. Four states rather than a boolean: a lead
   * with nothing recorded and a lead processed on another lawful basis are
   * different facts, and collapsing them would report one as the other.
   */
  consent: ConsentDisplayState;
  /** Whether marketing may still be sent, shown beside the main state. */
  marketingConsent: boolean;
  status: LeadStatus;
  source: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  productName: string | null;
  formName: string | null;
  assignedToName: string | null;
  value: string | null;
  followUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadPermissions = {
  edit: boolean;
  assign: boolean;
  delete: boolean;
  export: boolean;
};

/** True when the follow-up date has passed and still needs action. */
function isOverdue(followUpAt: string | null): boolean {
  if (!followUpAt) return false;
  return new Date(followUpAt).getTime() < Date.now();
}

export function LeadsTable({
  rows,
  can,
  staff,
  filters,
  filtered,
  total,
  showCountry = false,
}: {
  rows: LeadRow[];
  can: LeadPermissions;
  staff: Array<{ id: string; name: string }>;
  filters: Record<string, string | undefined>;
  filtered: boolean;
  total: number;
  /** Adds the Country column. Hidden on a single-market installation. */
  showCountry?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const selection = useSelection(rows);
  const [busy, setBusy] = React.useState(false);
  const [bulkStatus, setBulkStatus] = React.useState('');
  const [bulkAssignee, setBulkAssignee] = React.useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);
  const [confirmRowDelete, setConfirmRowDelete] = React.useState<LeadRow | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Done.');
    selection.clear();
    router.refresh();
    return true;
  }

  async function onExport() {
    setBusy(true);
    const result = await exportLeads(filters);
    setBusy(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    downloadCsv(result.data!.csv, result.data!.filename);
    toast('Export downloaded.');
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title={filtered ? 'No leads match these filters' : 'No leads yet'}
        description={
          filtered
            ? 'Try removing a filter chip above, or clear them all to see every lead.'
            : 'Leads captured from your website forms and product buttons appear here automatically.'
        }
        action={
          filtered ? (
            <ButtonLink href="/admin/leads" variant="outline">
              Clear filters
            </ButtonLink>
          ) : (
            <ButtonLink href="/admin/forms">Set up a form</ButtonLink>
          )
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">
          <span className="font-medium text-content">{total.toLocaleString()}</span>{' '}
          {total === 1 ? 'lead' : 'leads'}
          {filtered ? ' matching' : ''}
        </p>
        {can.export ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={busy}
            className="ml-auto"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        ) : null}
      </div>

      {selection.selected.length > 0 ? (
        <div className="px-4 pt-3 sm:px-5">
          <BulkBar count={selection.selected.length} onClear={selection.clear}>
            {can.edit ? (
              <span className="flex items-center gap-1.5">
                <label htmlFor="bulk-status" className="sr-only">
                  Set status
                </label>
                <Select
                  id="bulk-status"
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(event.target.value)}
                  className="h-8 py-0 text-xs"
                >
                  <option value="">Set status…</option>
                  {LEAD_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!bulkStatus || busy}
                  onClick={() =>
                    run(() =>
                      bulkLeadAction({
                        ids: selection.selected,
                        action: 'status',
                        status: bulkStatus as LeadStatus,
                      }),
                    )
                  }
                >
                  Apply
                </Button>
              </span>
            ) : null}

            {can.assign ? (
              <span className="flex items-center gap-1.5">
                <label htmlFor="bulk-assignee" className="sr-only">
                  Assign to
                </label>
                <Select
                  id="bulk-assignee"
                  value={bulkAssignee}
                  onChange={(event) => setBulkAssignee(event.target.value)}
                  className="h-8 py-0 text-xs"
                >
                  <option value="">Assign to…</option>
                  <option value="none">Unassign</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!bulkAssignee || busy}
                  onClick={() =>
                    run(() =>
                      bulkLeadAction({
                        ids: selection.selected,
                        action: 'assign',
                        assignedToId: bulkAssignee === 'none' ? null : bulkAssignee,
                      }),
                    )
                  }
                >
                  Apply
                </Button>
              </span>
            ) : null}

            {can.delete ? (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => setConfirmBulkDelete(true)}
              >
                Delete
              </Button>
            ) : null}
          </BulkBar>
        </div>
      ) : null}

      {/* Desktop: full table. */}
      {/*
        The wrapper is the scroll container (overflow-x makes overflow-y
        compute to auto), so the header sticks to it rather than to the
        viewport. Bounding the height in viewport units gives it something to
        stick to at any window size, and leaves room for the admin chrome and
        the pagination bar beneath. A short list never reaches the cap, so it
        simply does not scroll.
      */}
      <TableWrap className="hidden md:block" maxHeight="calc(100vh - 22rem)">
        <Table className="min-w-[64rem]" stickyHeader>
          <caption className="sr-only">Leads</caption>
          <StickyThead>
            <tr>
              {can.edit ? (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    aria-label="Select all leads on this page"
                    className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                  />
                </Th>
              ) : null}
              <SortableTh field="name" defaultDir="asc">
                Lead
              </SortableTh>
              <Th>Company</Th>
              {showCountry ? <Th>Country</Th> : null}
              <Th>Source</Th>
              <Th>Product / form</Th>
              <Th>Owner</Th>
              <SortableTh field="status" defaultDir="asc">
                Status
              </SortableTh>
              <Th>Consent</Th>
              <SortableTh field="updatedAt">Last activity</SortableTh>
              <SortableTh field="createdAt">Created</SortableTh>
              <Th align="right">Actions</Th>
            </tr>
          </StickyThead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                {can.edit ? (
                  <Td>
                    <input
                      type="checkbox"
                      checked={selection.selected.includes(row.id)}
                      onChange={() => selection.toggle(row.id)}
                      aria-label={`Select ${row.name}`}
                      className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                    />
                  </Td>
                ) : null}

                <Td>
                  <Link
                    href={`/admin/leads/${row.id}`}
                    className="font-medium text-content transition-colors hover:text-brand"
                  >
                    {row.name}
                  </Link>
                  <span
                    className="block max-w-[16rem] truncate text-xs text-muted"
                    title={row.email}
                  >
                    {row.email}
                  </span>
                  {row.followUpAt ? (
                    <span
                      className={cn(
                        'mt-1 inline-flex items-center gap-1 text-[0.6875rem] font-medium',
                        isOverdue(row.followUpAt) ? 'text-amber-600' : 'text-muted',
                      )}
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {isOverdue(row.followUpAt) ? 'Follow-up overdue' : 'Follow-up set'}
                    </span>
                  ) : null}
                </Td>

                <Td className="max-w-[12rem] text-sm text-muted">
                  <span className="block truncate" title={row.company ?? undefined}>
                    {row.company ?? '—'}
                  </span>
                </Td>

                {showCountry ? (
                  <Td className="whitespace-nowrap text-sm text-content">{row.countryName}</Td>
                ) : null}

                <Td className="max-w-[12rem] text-sm text-muted">
                  <span className="block truncate" title={row.source ?? row.utmSource ?? undefined}>
                    {row.source ?? row.utmSource ?? '—'}
                  </span>
                  {row.utmCampaign ? (
                    <span className="block truncate text-xs text-muted/80" title={row.utmCampaign}>
                      {row.utmCampaign}
                    </span>
                  ) : null}
                </Td>

                <Td className="max-w-[12rem] text-sm text-muted">
                  <span className="block truncate" title={row.productName ?? undefined}>
                    {row.productName ?? '—'}
                  </span>
                  {row.formName ? (
                    <span className="block truncate text-xs text-muted/80" title={row.formName}>
                      {row.formName}
                    </span>
                  ) : null}
                </Td>

                <Td className="text-sm">
                  {row.assignedToName ? (
                    <span className="text-muted">{row.assignedToName}</span>
                  ) : (
                    <span className="text-amber-600">Unassigned</span>
                  )}
                  {row.value ? (
                    <span className="block text-xs text-muted">{formatMoney(row.value)}</span>
                  ) : null}
                </Td>

                <Td>
                  <LeadStatusBadge status={row.status} />
                </Td>

                <Td>
                  <ConsentChip state={row.consent} marketing={row.marketingConsent} />
                </Td>

                <Td className="whitespace-nowrap text-sm text-muted">
                  {formatRelative(row.updatedAt)}
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">
                  {formatRelative(row.createdAt)}
                </Td>

                <Td align="right">
                  <div className="flex items-center justify-end">
                    <RowMenu label={`Actions for ${row.name}`}>
                      <RowMenuItem onClick={() => router.push(`/admin/leads/${row.id}`)}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Open lead
                      </RowMenuItem>
                      <RowMenuItem onClick={() => window.open(`mailto:${row.email}`, '_self')}>
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        Email lead
                      </RowMenuItem>
                      {row.phone ? (
                        <RowMenuItem onClick={() => window.open(`tel:${row.phone}`, '_self')}>
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          Call {row.phone}
                        </RowMenuItem>
                      ) : null}
                      {can.assign ? (
                        <RowMenuItem onClick={() => router.push(`/admin/leads/${row.id}#assign`)}>
                          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Assign owner
                        </RowMenuItem>
                      ) : null}
                      {can.delete ? (
                        <RowMenuItem tone="danger" onClick={() => setConfirmRowDelete(row)}>
                          <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </RowMenuItem>
                      ) : null}
                    </RowMenu>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {/* Mobile: cards, because ten columns are unusable on a phone. */}
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/leads/${row.id}`}
              className="block px-4 py-3 transition-colors hover:bg-muted/[0.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">{row.name}</p>
                  <p className="truncate text-xs text-muted">
                    {row.company ?? row.email}
                    {showCountry ? ` · ${row.countryName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <LeadStatusBadge status={row.status} />
                  <ConsentChip state={row.consent} marketing={row.marketingConsent} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{row.assignedToName ?? 'Unassigned'}</span>
                {row.productName ? <span>· {row.productName}</span> : null}
                <span className="ml-auto">{formatRelative(row.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async () => {
          await run(() => bulkLeadAction({ ids: selection.selected, action: 'delete' }));
          setConfirmBulkDelete(false);
        }}
        title={`Delete ${selection.selected.length} ${selection.selected.length === 1 ? 'lead' : 'leads'}?`}
        message="They are removed from the CRM, reports and the pipeline. Their form submissions are kept."
        confirmLabel="Delete leads"
        pending={busy}
      />

      <ConfirmDialog
        open={Boolean(confirmRowDelete)}
        onClose={() => setConfirmRowDelete(null)}
        onConfirm={async () => {
          if (confirmRowDelete) {
            await run(() => bulkLeadAction({ ids: [confirmRowDelete.id], action: 'delete' }));
          }
          setConfirmRowDelete(null);
        }}
        title={confirmRowDelete ? `Delete “${confirmRowDelete.name}”?` : ''}
        message="The lead is removed from the CRM, reports and the pipeline. Its form submission is kept."
        confirmLabel="Delete lead"
        pending={busy}
      />
    </>
  );
}

const CONSENT_CHIP: Record<ConsentDisplayState, string> = {
  RECORDED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  NOT_RECORDED: 'bg-muted/10 text-muted ring-current/15',
  WITHDRAWN: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  NOT_APPLICABLE: 'bg-muted/10 text-muted ring-current/15',
};

/**
 * One lead's consent, compactly.
 *
 * The marketing dot is shown separately rather than folded into the main
 * state: "agreed we may answer your enquiry" and "agreed to marketing" are
 * different permissions, and a single tick that meant either would be read as
 * meaning both.
 */
function ConsentChip({
  state,
  marketing,
}: {
  state: ConsentDisplayState;
  marketing: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset',
          CONSENT_CHIP[state],
        )}
      >
        {state === 'RECORDED' ? <span aria-hidden="true">✓</span> : null}
        {CONSENT_DISPLAY_LABELS[state]}
      </span>
      {marketing ? (
        <span
          className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-brand"
          title="Also agreed to marketing"
        >
          Mktg
        </span>
      ) : null}
    </span>
  );
}
