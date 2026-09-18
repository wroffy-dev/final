'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { buttonClasses } from '@/components/ui/button';
import type { ResolvedNavItem } from '@/lib/services/navigation';
import type { MarketOption } from '@/lib/country/switch';
import { MarketSwitcher } from './market-switcher';

export type HeaderBrand = {
  siteName: string;
  logoUrl: string | null;
  /** The current market's home page. `/` for the root market. */
  homeUrl: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
  announcement: { text: string; url: string | null } | null;
};

export function SiteHeader({
  nav,
  brand,
  markets = [],
}: {
  nav: ResolvedNavItem[];
  brand: HeaderBrand;
  /** Every market a visitor can switch to. Fewer than two renders nothing. */
  markets?: MarketOption[];
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [pathname]);

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setOpenDropdown(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isActive = (href: string) =>
    href !== '/' && href !== '#' ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;

  return (
    <header className="sticky top-0 z-topbar w-full">
      {brand.announcement ? (
        <div className="bg-[rgb(var(--brand-secondary))] px-4 py-2 text-center text-xs text-white sm:text-sm">
          {brand.announcement.url ? (
            <Link href={brand.announcement.url} className="underline-offset-4 hover:underline">
              {brand.announcement.text}
            </Link>
          ) : (
            <span>{brand.announcement.text}</span>
          )}
        </div>
      ) : null}

      <div className="border-b border-hairline bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6" aria-label="Main">
          <Link
            href={brand.homeUrl}
            className="flex shrink-0 items-center gap-2"
            aria-label={`${brand.siteName} home`}
          >
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.siteName} className="h-8 w-auto max-w-[10rem] object-contain" />
            ) : (
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                  {brand.siteName.charAt(0).toUpperCase()}
                </span>
                <span className="font-heading text-base font-bold text-content">{brand.siteName}</span>
              </span>
            )}
          </Link>

          <ul className="hidden flex-1 items-center gap-1 lg:flex">
            {nav.map((item) => (
              <li key={item.id} className="relative">
                {item.children.length > 0 ? (
                  <div
                    onMouseEnter={() => setOpenDropdown(item.id)}
                    onMouseLeave={() => setOpenDropdown(null)}
                  >
                    <button
                      type="button"
                      aria-expanded={openDropdown === item.id}
                      aria-haspopup="true"
                      onClick={() => setOpenDropdown(openDropdown === item.id ? null : item.id)}
                      className={cn(
                        'nav-tokens flex items-center gap-1 rounded-lg px-3 py-2 transition-colors',
                        isActive(item.href) ? 'text-brand' : 'text-content hover:text-brand',
                      )}
                    >
                      {item.label}
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 transition-transform', openDropdown === item.id && 'rotate-180')}
                      />
                    </button>
                    {openDropdown === item.id ? (
                      <div className="absolute left-0 top-full w-[22rem] pt-2">
                        <ul className="animate-slide-up rounded-xl border border-hairline bg-surface p-2 shadow-xl">
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <Link
                                href={child.href}
                                target={child.openInNewTab ? '_blank' : undefined}
                                rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/[0.06]"
                              >
                                <span className="block text-sm font-medium text-content">{child.label}</span>
                                {child.description ? (
                                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                                    {child.description}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    target={item.openInNewTab ? '_blank' : undefined}
                    rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'nav-tokens rounded-lg px-3 py-2 transition-colors',
                      isActive(item.href) ? 'text-brand' : 'text-content hover:text-brand',
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <MarketSwitcher markets={markets} />
            {brand.secondaryCtaLabel && brand.secondaryCtaUrl ? (
              <Link href={brand.secondaryCtaUrl} className={buttonClasses('ghost', 'sm', 'btn-tokens')}>
                {brand.secondaryCtaLabel}
              </Link>
            ) : null}
            {brand.ctaLabel && brand.ctaUrl ? (
              <Link href={brand.ctaUrl} className={buttonClasses('primary', 'sm', 'btn-tokens')}>
                {brand.ctaLabel}
              </Link>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="ml-auto rounded-lg p-2 text-content transition-colors hover:bg-muted/10 lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {mobileOpen ? (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 bottom-0 top-[var(--header-offset,4rem)] z-drawer overflow-y-auto border-t border-hairline bg-surface lg:hidden"
        >
          <ul className="space-y-1 px-4 py-4">
            {nav.map((item) => (
              <li key={item.id}>
                {item.children.length > 0 ? (
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 text-base font-medium text-content marker:content-none">
                      {item.label}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="ml-3 space-y-1 border-l border-hairline pl-3">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <Link href={child.href} className="block rounded-lg px-3 py-2.5 text-sm text-muted">
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link href={item.href} className="block rounded-lg px-3 py-3 text-base font-medium text-content">
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-hairline px-4 py-4">
            {markets.length > 1 ? (
              <nav aria-label="Country" className="pb-2">
                <ul className="flex flex-wrap gap-2">
                  {markets.map((market) => (
                    <li key={market.code}>
                      <Link
                        href={market.href}
                        hrefLang={market.locale}
                        aria-current={market.isCurrent ? 'true' : undefined}
                        className={cn(
                          'inline-flex items-center rounded-lg border border-hairline px-3 py-2 text-sm transition-colors',
                          market.isCurrent
                            ? 'border-brand text-brand'
                            : 'text-content hover:text-brand',
                        )}
                      >
                        {market.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {brand.ctaLabel && brand.ctaUrl ? (
              <Link href={brand.ctaUrl} className={buttonClasses('primary', 'lg', 'w-full btn-tokens')}>
                {brand.ctaLabel}
              </Link>
            ) : null}
            {brand.secondaryCtaLabel && brand.secondaryCtaUrl ? (
              <Link href={brand.secondaryCtaUrl} className={buttonClasses('outline', 'lg', 'w-full btn-tokens')}>
                {brand.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
