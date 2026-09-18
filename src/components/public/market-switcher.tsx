'use client';

import * as React from 'react';
import Link from 'next/link';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { MarketOption } from '@/lib/country/switch';

/**
 * The public market switcher.
 *
 * Deliberately built from the header's own vocabulary — the same `nav-tokens`
 * type, the same rounded-lg hit area, the same dropdown card as the navigation
 * menus — so it reads as part of the header rather than as a bolted-on widget.
 *
 * Every option is a plain link to a URL the server already resolved against
 * published content, so switching is one ordinary navigation: no client-side
 * lookup, no redirect chain and nothing that can loop.
 */
export function MarketSwitcher({
  markets,
  className,
}: {
  markets: MarketOption[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (markets.length < 2) return null;
  const current = markets.find((market) => market.isCurrent) ?? markets[0];
  if (!current) return null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Change country — currently ${current.name}`}
        className="nav-tokens flex items-center gap-1.5 rounded-lg px-3 py-2 text-content transition-colors hover:text-brand"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span>{current.code}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-60 pt-2">
          <ul className="animate-slide-up rounded-xl border border-hairline bg-surface p-2 shadow-xl">
            {markets.map((market) => (
              <li key={market.code}>
                <Link
                  href={market.href}
                  hrefLang={market.locale}
                  aria-current={market.isCurrent ? 'true' : undefined}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/[0.06]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-content">
                      {market.name}
                    </span>
                    {!market.isEquivalent && !market.isCurrent ? (
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                        Goes to the {market.name} home page
                      </span>
                    ) : null}
                  </span>
                  {market.isCurrent ? (
                    <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
