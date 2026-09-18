'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import {
  RANGE_PRESET_LABELS,
  formatRangeLabel,
  type DateRange,
  type RangePreset,
} from '@/lib/admin/date-range';
import { cn } from '@/lib/utils/cn';

const PRESET_ORDER: RangePreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
];

/**
 * The range control for the CRM dashboard and reports.
 *
 * The choice lives in the query string, so refreshing keeps it, the back
 * button works and a filtered view can be shared. Nothing is filtered here —
 * the page re-renders on the server with the new bounds.
 */
export function DateRangePicker({ range }: { range: DateRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ from: range.from, to: range.to });
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setDraft({ from: range.from, to: range.to }), [range.from, range.to]);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const push = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new range always returns to the first page of any list beneath it.
    next.delete('page');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const choosePreset = (preset: RangePreset) => {
    setOpen(false);
    push({ range: preset, from: null, to: null });
  };

  const applyCustom = () => {
    if (!draft.from || !draft.to) return;
    setOpen(false);
    push({ range: null, from: draft.from, to: draft.to });
  };

  const reset = () => {
    setOpen(false);
    push({ range: null, from: null, to: null });
  };

  const label =
    range.preset === 'custom' ? formatRangeLabel(range) : RANGE_PRESET_LABELS[range.preset];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
          open
            ? 'border-brand bg-brand/[0.04] text-content'
            : 'border-hairline text-content hover:bg-muted/[0.06]',
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="font-medium">{label}</span>
        <span className="hidden text-xs text-muted sm:inline">{formatRangeLabel(range)}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute right-0 top-full z-dropdown mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-hairline bg-surface p-3 shadow-xl"
        >
          <div className="grid grid-cols-2 gap-1">
            {PRESET_ORDER.map((preset) => {
              const active = range.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => choosePreset(preset)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-brand/10 font-medium text-brand'
                      : 'text-content hover:bg-muted/[0.07]',
                  )}
                >
                  {RANGE_PRESET_LABELS[preset]}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-hairline pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Custom range
            </p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="range-from" className="mb-1 block text-xs text-muted">
                  Start date
                </label>
                <Input
                  id="range-from"
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="range-to" className="mb-1 block text-xs text-muted">
                  End date
                </label>
                <Input
                  id="range-to"
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={applyCustom} disabled={!draft.from || !draft.to}>
                Apply
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
