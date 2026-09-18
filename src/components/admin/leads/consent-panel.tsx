'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ShieldCheck, ShieldOff, ShieldQuestion } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { recordConsentWithdrawal } from '@/lib/actions/leads';
import {
  BUILT_IN_NOTICE_VERSION,
  CONSENT_DISPLAY_LABELS,
  MARKETING_DISPLAY_LABELS,
  consentDisplayState,
  marketingDisplayState,
  type ConsentDisplayState,
} from '@/lib/privacy/consent';
import { cn } from '@/lib/utils/cn';

export type ConsentEventView = {
  id: string;
  type: string;
  scope: string;
  value: boolean;
  actorName: string | null;
  actorType: string;
  note: string | null;
  createdAt: string;
};

export type ConsentRecordView = {
  id: string;
  lawfulBasis: 'CONSENT' | 'CONTRACT' | 'LEGITIMATE_INTEREST' | 'LEGAL_OBLIGATION';
  enquiryConsent: boolean;
  marketingConsent: boolean;
  /** Was marketing on screen at all? Null on records written before this. */
  marketingPresented: boolean | null;
  termsAccepted: boolean;
  termsRequired: boolean;
  purposeText: string;
  noticeKey: string;
  noticeVersion: number;
  /** Null for the shared notice; otherwise the market it was published for. */
  noticeScope: string | null;
  /** The exact sentence beside the tick box. Null before there was one. */
  displayedLabel: string | null;
  /** The wording as it was shown, not as it reads today. */
  noticeText: { enquiryLabel: string; marketingLabel: string; termsLabel: string } | null;
  privacyUrl: string;
  privacyVersion: string | null;
  termsUrl: string;
  termsVersion: string | null;
  consentedAt: string;
  withdrawnAt: string | null;
  withdrawnScope: string | null;
  events: ConsentEventView[];
};

/**
 * The consent evidence for one lead.
 *
 * Shows what was agreed, the exact wording it was agreed against, and the
 * history — including a withdrawal, which sits alongside the original grant
 * rather than replacing it. A lead with no record says so plainly: leads
 * captured before this existed have no evidence, and the panel must not
 * invent any.
 */
export function ConsentPanel({
  record,
  ip,
  canManage,
}: {
  record: ConsentRecordView | null;
  /** Null when the viewer lacks leads.viewIp, or when none was recorded. */
  ip: { address: string | null; status: string; visible: boolean };
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [scope, setScope] = React.useState<'MARKETING' | 'ALL'>('MARKETING');
  const [note, setNote] = React.useState('');

  const state: ConsentDisplayState = consentDisplayState(
    record
      ? {
          lawfulBasis: record.lawfulBasis,
          enquiryConsent: record.enquiryConsent,
          withdrawnAt: record.withdrawnAt ? new Date(record.withdrawnAt) : null,
        }
      : null,
  );

  /*
   * Marketing is its own state, not a second reading of the enquiry one.
   * "Not offered" and "offered and declined" are different facts, and
   * collapsing them into "Not agreed" is exactly the misleading single boolean
   * the evidence exists to avoid.
   */
  const marketingState = marketingDisplayState(
    record
      ? {
          marketingConsent: record.marketingConsent,
          marketingPresented: record.marketingPresented,
          withdrawnAt: record.withdrawnAt ? new Date(record.withdrawnAt) : null,
        }
      : null,
  );

  async function withdraw() {
    if (!record) return;
    setBusy(true);
    const result = await recordConsentWithdrawal({ recordId: record.id, scope, note });
    setBusy(false);
    setAsking(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Withdrawal recorded.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Consent & privacy"
        description="What this person agreed to, and the wording they agreed against."
        actions={<StateBadge state={state} />}
      />
      <CardBody className="space-y-5 text-sm">
        {!record ? (
          <div className="rounded-lg border border-dashed border-hairline p-4 text-muted">
            <p className="font-medium text-content">No consent evidence recorded</p>
            <p className="mt-1 leading-relaxed">
              This lead was captured before consent evidence was collected, or through a route that
              did not record it. Nothing has been assumed on their behalf.
            </p>
          </div>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Row
                label="Enquiry processing"
                value={record.enquiryConsent ? 'Agreed' : 'Not agreed'}
                tone={record.enquiryConsent ? 'good' : 'muted'}
              />
              <Row
                label="Marketing"
                value={MARKETING_DISPLAY_LABELS[marketingState]}
                tone={marketingState === 'AGREED' ? 'good' : 'muted'}
              />
              <Row
                label="Terms & Conditions"
                value={
                  record.termsRequired
                    ? record.termsAccepted
                      ? 'Accepted'
                      : 'Not accepted'
                    : 'Not asked'
                }
                tone={record.termsRequired && record.termsAccepted ? 'good' : 'muted'}
              />
              <Row label="Lawful basis" value={humanBasis(record.lawfulBasis)} />
              <Row label="Given at" value={formatStamp(record.consentedAt)} />
              <Row
                label="Notice version"
                value={
                  // Version 0 is the wording built into the site, shown when no
                  // notice has been published in the CMS. “v0” would read like a
                  // draft; it is not one.
                  [
                    record.noticeVersion === BUILT_IN_NOTICE_VERSION
                      ? `${record.noticeKey} — built-in wording`
                      : `${record.noticeKey} v${record.noticeVersion}`,
                    record.noticeScope ? `(${record.noticeScope})` : '(every market)',
                  ].join(' ')
                }
              />
              {ip.visible ? (
                <Row
                  label="IP address"
                  value={ip.address ?? describeMissingIp(ip.status)}
                  tone={ip.address ? undefined : 'muted'}
                />
              ) : null}
              {record.withdrawnAt ? (
                <Row
                  label="Withdrawn"
                  value={`${formatStamp(record.withdrawnAt)} (${(record.withdrawnScope ?? '').toLowerCase()})`}
                  tone="warn"
                />
              ) : null}
            </dl>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Purpose shown
              </p>
              <p className="mt-1 leading-relaxed text-content">{record.purposeText}</p>
            </div>

            {record.displayedLabel ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Tick box wording
                </p>
                <p className="mt-1 leading-relaxed text-content">“{record.displayedLabel}”</p>
              </div>
            ) : null}

            {record.noticeText ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  What it covered
                </p>
                {/*
                  * Only what was actually on screen. A sentence that was not
                  * shown is not listed as "accepted", whatever the notice row
                  * happens to contain today.
                  */}
                <ul className="mt-1 space-y-1.5 leading-relaxed text-content">
                  {record.lawfulBasis === 'CONSENT' ? (
                    <li>“{record.noticeText.enquiryLabel}”</li>
                  ) : null}
                  {record.termsRequired ? <li>“{record.noticeText.termsLabel}”</li> : null}
                  {record.marketingPresented && record.noticeText.marketingLabel ? (
                    <li className="text-muted">“{record.noticeText.marketingLabel}”</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <PolicyLink href={record.privacyUrl} version={record.privacyVersion}>
                Privacy Policy
              </PolicyLink>
              {record.termsRequired ? (
                <PolicyLink href={record.termsUrl} version={record.termsVersion}>
                  Terms &amp; Conditions
                </PolicyLink>
              ) : null}
            </div>

            {record.events.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">History</p>
                <ul className="mt-2 space-y-1.5">
                  {record.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap gap-x-2 text-xs text-muted">
                      <span className="font-medium text-content">
                        {event.type === 'WITHDRAWN' ? 'Withdrew' : 'Gave'}{' '}
                        {event.scope.toLowerCase()}
                      </span>
                      <span>{event.value ? 'yes' : 'no'}</span>
                      <span>·</span>
                      <span>{formatStamp(event.createdAt)}</span>
                      <span>·</span>
                      <span>{event.actorName ?? event.actorType.toLowerCase()}</span>
                      {event.note ? <span className="w-full">“{event.note}”</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canManage && !(record.withdrawnAt && record.withdrawnScope === 'ALL') ? (
              <div className="border-t border-hairline pt-4">
                <Button variant="outline" size="sm" onClick={() => setAsking(true)} disabled={busy}>
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                  Record a withdrawal
                </Button>
                <p className="mt-2 text-xs text-muted">
                  Recording a withdrawal keeps everything above exactly as it is and adds an entry
                  to the history. Marketing is suppressed for this lead straight away.
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardBody>

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Record a consent withdrawal"
        description="Nothing already recorded is changed. This adds an entry to the history and stops consent-based marketing for this lead."
        footer={
          <>
            <Button variant="outline" onClick={() => setAsking(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={withdraw} disabled={busy}>
              {busy ? 'Recording…' : 'Record withdrawal'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-left">
          <Field label="What was withdrawn" htmlFor="withdraw-scope">
            <Select
              id="withdraw-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as 'MARKETING' | 'ALL')}
            >
              <option value="MARKETING">Marketing only</option>
              <option value="ALL">All consent</option>
            </Select>
          </Field>
          <Field
            label="Note"
            htmlFor="withdraw-note"
            hint="How the request reached you — an email, a phone call, a reply."
          >
            <Textarea
              id="withdraw-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </Card>
  );
}

function StateBadge({ state }: { state: ConsentDisplayState }) {
  const Icon =
    state === 'RECORDED' ? ShieldCheck : state === 'WITHDRAWN' ? ShieldOff : ShieldQuestion;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        state === 'RECORDED' && 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        state === 'WITHDRAWN' && 'bg-amber-50 text-amber-700 ring-amber-600/20',
        (state === 'NOT_RECORDED' || state === 'NOT_APPLICABLE') &&
          'bg-muted/10 text-muted ring-current/15',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {CONSENT_DISPLAY_LABELS[state]}
    </span>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'muted';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words',
          tone === 'good' && 'font-medium text-emerald-700',
          tone === 'warn' && 'font-medium text-amber-700',
          tone === 'muted' && 'text-muted',
          !tone && 'text-content',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function PolicyLink({
  href,
  version,
  children,
}: {
  href: string;
  version: string | null;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-brand hover:underline"
    >
      {children}
      {version ? ` (v${version})` : null}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function humanBasis(basis: string): string {
  return (
    {
      CONSENT: 'Consent',
      CONTRACT: 'Performance of a contract',
      LEGITIMATE_INTEREST: 'Legitimate interest',
      LEGAL_OBLIGATION: 'Legal obligation',
    }[basis] ?? basis
  );
}

/** Says which kind of "no address" this is, rather than showing an empty cell. */
function describeMissingIp(status: string): string {
  return (
    {
      UNAVAILABLE: 'Not available',
      UNTRUSTED: 'Not recorded — arrived from an untrusted proxy',
      PURGED: 'Removed by the retention period',
      RECORDED: 'Not available',
    }[status] ?? 'Not recorded'
  );
}

function formatStamp(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC';
}
