'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [range, setRange] = React.useState({ from, to });

  function apply(next: { from: string; to: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', next.from);
    params.set('to', next.to);
    router.push(`${pathname}?${params.toString()}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    const next = { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    setRange(next);
    apply(next);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((option) => (
        <Button key={option.days} variant="outline" size="sm" onClick={() => preset(option.days)}>
          {option.label}
        </Button>
      ))}
      <div>
        <label htmlFor="range-from" className="sr-only">
          From date
        </label>
        <Input
          id="range-from"
          type="date"
          value={range.from}
          max={range.to}
          onChange={(e) => setRange({ ...range, from: e.target.value })}
          className="h-8 py-0 text-xs"
        />
      </div>
      <div>
        <label htmlFor="range-to" className="sr-only">
          To date
        </label>
        <Input
          id="range-to"
          type="date"
          value={range.to}
          min={range.from}
          onChange={(e) => setRange({ ...range, to: e.target.value })}
          className="h-8 py-0 text-xs"
        />
      </div>
      <Button size="sm" onClick={() => apply(range)}>
        Apply
      </Button>
    </div>
  );
}
