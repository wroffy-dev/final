import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';
import { NavIcon } from './nav-icon';

export type StatTone = 'default' | 'brand' | 'success' | 'danger' | 'warning';

/**
 * KPI tile.
 *
 * Deliberately restrained: one number, one label, optional supporting line.
 * Colour is reserved for values that carry meaning (won, lost) so the eye is
 * drawn to something real rather than to decoration.
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  /** NavIcon key. */
  icon?: string;
  tone?: StatTone;
  className?: string;
}) {
  const valueTone = {
    default: 'text-content',
    brand: 'text-brand',
    success: 'text-emerald-600',
    danger: 'text-red-600',
    warning: 'text-amber-600',
  }[tone];

  const iconTone = {
    default: 'bg-muted/10 text-muted',
    brand: 'bg-brand/10 text-brand',
    success: 'bg-emerald-50 text-emerald-600',
    danger: 'bg-red-50 text-red-600',
    warning: 'bg-amber-50 text-amber-600',
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon ? (
          <span
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconTone)}
          >
            <NavIcon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          'mt-3 font-heading text-2xl font-bold tracking-tight sm:text-[1.75rem]',
          valueTone,
        )}
      >
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>

      <div className="mt-1 flex items-center gap-1">
        {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
        {href ? (
          <ArrowUpRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </>
  );

  const shell = cn(
    'group flex h-full flex-col rounded-xl border border-hairline bg-surface p-4 sm:p-5',
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(shell, 'transition-colors hover:border-brand/40 hover:bg-brand/[0.02]')}
      >
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
