'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, CircleAlert, Copy, Info, MinusCircle } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { syncCountryContent } from '@/lib/actions/country-sync';
import {
  SYNC_ENTITIES,
  SYNC_ENTITY_LABELS,
  type SyncResult,
  type SyncLogEntry,
  type SyncEntity,
  // From the client-safe module, not the engine: importing the engine here
  // would pull `server-only` and Prisma into the browser bundle.
} from '@/lib/country/sync-entities';
import { cn } from '@/lib/utils/cn';

/**
 * "Sync from <source>", on a destination market's screen.
 *
 * Preview first, by default. The preview takes the same decisions the real run
 * takes and writes nothing, so the counts shown above the button are the counts
 * that happen when it is pressed — which is the only way an administrator can
 * approve something they have actually seen.
 *
 * There is no mode. This adds content this market has never had, and that is
 * the only thing it does: nothing already here is changed, and nothing this
 * market removed comes back.
 */
export function SyncPanel({
  sourceName,
  target,
  canSync,
}: {
  sourceName: string;
  target: { id: string; name: string; currency: string };
  canSync: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<'preview' | 'run' | null>(null);
  const [preview, setPreview] = React.useState<SyncResult | null>(null);
  const [outcome, setOutcome] = React.useState<SyncResult | null>(null);

  async function run(previewOnly: boolean) {
    setBusy(previewOnly ? 'preview' : 'run');
    try {
      const result = await syncCountryContent({ targetCountryId: target.id, previewOnly });

      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      if (previewOnly) {
        setPreview(result.data ?? null);
        setOutcome(null);
        return;
      }
      setOutcome(result.data ?? null);
      setPreview(null);
      toast(result.message ?? 'Sync complete.');
      router.refresh();
    } catch {
      // A failure that is not a refused sync — a dropped connection, a deploy
      // mid-request. Cleared in `finally` either way, so the button is never
      // left spinning with nothing to show for it.
      toast('Something went wrong running the sync. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const shown = outcome ?? preview;

  return (
    <Card className="mt-6">
      <CardHeader
        title={`Sync content from ${sourceName}`}
        description={`Adds ${sourceName}'s pages, menus, forms, categories and products to ${target.name}. Everything arrives as a draft for review.`}
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-muted/[0.03] p-3 text-sm">
          <span className="font-medium text-content">{sourceName}</span>
          <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />
          <span className="font-medium text-content">{target.name}</span>
          <span className="ml-auto text-xs text-muted">{sourceName} is never modified</span>
        </div>

        <div className="rounded-lg border border-hairline p-3 text-xs leading-relaxed text-muted">
          <p className="font-medium text-content">This only ever adds</p>
          <p className="mt-1">
            Anything {target.name} already has is left exactly as it is, however much it has been
            edited since. Anything {target.name} has deleted stays deleted — removing something here
            is a decision, and pressing this will not undo it.
          </p>
          <p className="mt-2">
            Nothing is ever deleted from {target.name}, and nothing that happens in {sourceName}{' '}
            afterwards — including deleting a page or a product — changes anything here.
          </p>
          <p className="mt-2 font-medium text-content">What is never copied</p>
          <p className="mt-1">
            Leads, form submissions, consent records and IP addresses. Blog articles, categories and
            tags — the blog is written once and lives at the site root. Staff, permissions,
            credentials and audit logs. {sourceName}&rsquo;s own company and contact details.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-content">Prices are not copied.</strong> Products
            arrive configured in {target.currency} with their prices empty, because converting a
            figure from one currency to another is a decision, not a copy.
          </p>
        </div>

        {shown ? <Summary result={shown} isPreview={!outcome} sourceName={sourceName} target={target.name} /> : null}

        {canSync ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run(true)} disabled={busy !== null}>
              {busy === 'preview' ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                'Preview changes'
              )}
            </Button>
            <Button onClick={() => run(false)} disabled={busy !== null}>
              {busy === 'run' ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Syncing…
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Sync from {sourceName}
                </>
              )}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            You do not have permission to sync content between markets.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Summary({
  result,
  isPreview,
  sourceName,
  target,
}: {
  result: SyncResult;
  isPreview: boolean;
  sourceName: string;
  target: string;
}) {
  const localise = result.log.filter((entry) => (entry.localise?.length ?? 0) > 0);
  const conflicts = result.log.filter((entry) => entry.outcome === 'conflict');
  const failures = result.log.filter((entry) => entry.outcome === 'failed');

  // Only the kinds that actually have something to report, so a market with no
  // popups is not told about popups.
  const rows = SYNC_ENTITIES.map((entity) => ({ entity, counts: result.breakdown[entity] })).filter(
    ({ counts }) =>
      counts.created + counts.skipped + counts.deletedLocally + counts.conflicts + counts.failed > 0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            isPreview ? 'bg-brand/10 text-brand' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {isPreview ? (
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isPreview ? 'Preview — nothing written yet' : `${sourceName} → ${target} complete`}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-muted/[0.03] text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Content
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {isPreview ? 'To add' : 'Added'}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Already here
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Left removed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(({ entity, counts }) => (
                <tr key={entity}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-content">
                    {SYNC_ENTITY_LABELS[entity as SyncEntity]}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums text-content">
                    {counts.created}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{counts.skipped}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      counts.deletedLocally > 0 ? 'font-medium text-amber-700' : 'text-muted',
                    )}
                  >
                    {counts.deletedLocally}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {sourceName} has nothing {target} does not already have.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Excluded from every sync: leads, form submissions, consent records, IP addresses, blog
        articles, staff accounts and credentials.
      </p>

      {result.deletedLocally > 0 ? (
        <div className="rounded-lg border border-hairline bg-muted/[0.03] p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-content">
            <MinusCircle className="h-4 w-4 text-muted" aria-hidden="true" />
            {result.deletedLocally} item{result.deletedLocally === 1 ? '' : 's'} left removed
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Imported here once and deleted since. A deletion in this market is a decision, so these
            are not brought back. To have one again, add it here directly.
          </p>
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-50/60 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            Needs a decision
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {conflicts.map((entry, index) => (
              <li key={index}>
                <strong className="font-medium">{entry.label}</strong> — {entry.note}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900/80">
            Nothing above was changed. Rename or remove the local copy and sync again.
          </p>
        </div>
      ) : null}

      {failures.length > 0 ? (
        <div className="rounded-lg border border-red-500/30 bg-red-50/60 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            {failures.length} failed
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {failures.map((entry, index) => (
              <li key={index}>
                <strong className="font-medium">{entry.label}</strong>
                {entry.note ? ` — ${entry.note}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {localise.length > 0 ? (
        <div className="rounded-lg border border-hairline p-3">
          <p className="text-sm font-medium text-content">Needs localising</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {localise.slice(0, 20).map((entry, index) => (
              <li key={index}>
                <strong className="font-medium text-content">{entry.label}</strong> —{' '}
                {entry.localise?.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-lg border border-hairline">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-content">
          Full log ({result.log.length} {result.log.length === 1 ? 'entry' : 'entries'})
        </summary>
        <ul className="max-h-72 space-y-1 overflow-y-auto px-3 pb-3 text-xs">
          {result.log.map((entry, index) => (
            <LogRow key={index} entry={entry} />
          ))}
        </ul>
      </details>
    </div>
  );
}

function LogRow({ entry }: { entry: SyncLogEntry }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 border-b border-hairline py-1 last:border-0">
      <span
        className={cn(
          'w-24 shrink-0 font-medium',
          entry.outcome === 'created' && 'text-emerald-700',
          entry.outcome === 'deleted-locally' && 'text-amber-700',
          entry.outcome === 'conflict' && 'text-amber-700',
          entry.outcome === 'failed' && 'text-red-700',
          entry.outcome === 'skipped' && 'text-muted',
        )}
      >
        {entry.outcome === 'deleted-locally' ? 'left removed' : entry.outcome}
      </span>
      <span className="w-28 shrink-0 font-mono text-muted">
        {entry.entity.toLowerCase().replace(/_/g, ' ')}
      </span>
      <span className="min-w-0 flex-1 text-content">{entry.label}</span>
      {entry.note ? <span className="w-full text-muted sm:w-auto">{entry.note}</span> : null}
    </li>
  );
}
