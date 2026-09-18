'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Th } from '@/components/ui/table';
import { cn } from '@/lib/utils/cn';

/**
 * Column header that sorts through the URL.
 *
 * Sorting is a query param like every filter, so the server does the ordering
 * and a sorted view stays shareable and refresh-safe.
 */
export function SortableTh({
  field,
  children,
  align = 'left',
  className,
  defaultDir = 'desc',
}: {
  field: string;
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  defaultDir?: 'asc' | 'desc';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentField = searchParams.get('sort');
  const currentDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const active = currentField === field;

  const nextDir = active ? (currentDir === 'asc' ? 'desc' : 'asc') : defaultDir;

  const onSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', field);
    params.set('dir', nextDir);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const Icon = !active ? ChevronsUpDown : currentDir === 'asc' ? ChevronUp : ChevronDown;

  return (
    <Th
      align={align}
      className={cn('p-0', className)}
      aria-sort={active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'flex w-full items-center gap-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors',
          'hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
          align === 'right' && 'justify-end',
          align === 'center' && 'justify-center',
          active ? 'text-content' : 'text-muted',
        )}
      >
        {children}
        <Icon className={cn('h-3 w-3 shrink-0', !active && 'opacity-40')} aria-hidden="true" />
      </button>
    </Th>
  );
}
