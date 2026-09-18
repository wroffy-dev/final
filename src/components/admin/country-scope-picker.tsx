'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Globe } from 'lucide-react';
import { Select } from '@/components/ui/field';

/**
 * Which market a dashboard is reporting.
 *
 * The lists use the shared filter bar; a dashboard has no list to filter, so it
 * gets this instead — the same URL-backed state in the same place as the date
 * range picker beside it, so the view stays shareable and back/forward works.
 */
export function CountryScopePicker({
  value,
  options,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (options.length < 2) return null;

  const change = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('country', next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Country</span>
      <Globe className="h-4 w-4 text-muted" aria-hidden="true" />
      <Select
        value={value}
        onChange={(event) => change(event.target.value)}
        className="h-10 w-auto min-w-[10rem]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
