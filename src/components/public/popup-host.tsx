'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Button, buttonClasses } from '@/components/ui/button';
import { PublicFormLoader } from '@/components/forms/form-loader';

export type PopupConfig = {
  id: string;
  type: string;
  heading: string | null;
  body: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  formSlug: string | null;
  leadMagnetSlug: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  trigger: string;
  delaySeconds: number;
  scrollPercent: number;
  device: string;
  frequencyDays: number;
  urlPatterns: string[];
  pageSlugs: string[];
};

const STORAGE_PREFIX = 'popup_seen_';

function matchesPath(popup: PopupConfig, pathname: string, basePath: string): boolean {
  // Targeting is written against market-relative slugs ("pricing"), so the
  // market prefix comes off before matching — "/ae/pricing" targets "pricing"
  // exactly as "/pricing" does.
  const prefix = basePath === '/' ? '' : basePath;
  const relative = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  const slug = relative.replace(/^\/+|\/+$/g, '');
  if (popup.pageSlugs.length > 0 && popup.pageSlugs.includes(slug)) return true;
  if (popup.urlPatterns.length === 0 && popup.pageSlugs.length === 0) return true;
  return popup.urlPatterns.some((pattern) => {
    const normalised = pattern.trim().replace(/^\/+/, '');
    if (!normalised) return false;
    if (normalised.endsWith('*')) return slug.startsWith(normalised.slice(0, -1));
    return slug === normalised;
  });
}

function seenRecently(popup: PopupConfig): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + popup.id);
    if (!raw) return false;
    const seenAt = Number(raw);
    if (!Number.isFinite(seenAt)) return false;
    return Date.now() - seenAt < popup.frequencyDays * 86_400_000;
  } catch {
    return false;
  }
}

function markSeen(popupId: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + popupId, String(Date.now()));
  } catch {
    /* storage may be unavailable; the popup simply shows again next visit */
  }
}

/** Evaluates popup targeting and triggers entirely on the client. */
export function PopupHost({
  popups,
  basePath = '/',
}: {
  popups: PopupConfig[];
  /** The current market's URL prefix, so targeting stays market-relative. */
  basePath?: string;
}) {
  const pathname = usePathname();
  const [active, setActive] = React.useState<PopupConfig | null>(null);

  React.useEffect(() => {
    setActive(null);
    if (popups.length === 0) return;

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const candidates = popups.filter(
      (p) =>
        matchesPath(p, pathname, basePath) &&
        !seenRecently(p) &&
        (p.device === 'ALL' || (p.device === 'MOBILE') === isMobile),
    );
    const popup = candidates[0];
    if (!popup) return;

    const show = () => setActive(popup);
    const cleanups: Array<() => void> = [];

    if (popup.trigger === 'IMMEDIATE') {
      show();
    } else if (popup.trigger === 'DELAY') {
      const id = window.setTimeout(show, Math.max(0, popup.delaySeconds) * 1000);
      cleanups.push(() => window.clearTimeout(id));
    } else if (popup.trigger === 'SCROLL') {
      const onScroll = () => {
        const height = document.body.scrollHeight - window.innerHeight;
        const percent = height > 0 ? (window.scrollY / height) * 100 : 100;
        if (percent >= popup.scrollPercent) {
          show();
          window.removeEventListener('scroll', onScroll);
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
    } else if (popup.trigger === 'EXIT_INTENT') {
      const onLeave = (event: MouseEvent) => {
        if (event.clientY <= 0) {
          show();
          document.removeEventListener('mouseout', onLeave);
        }
      };
      document.addEventListener('mouseout', onLeave);
      cleanups.push(() => document.removeEventListener('mouseout', onLeave));
    }

    return () => cleanups.forEach((fn) => fn());
  }, [pathname, popups, basePath]);

  const close = React.useCallback(() => {
    if (active) markSeen(active.id);
    setActive(null);
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, close]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgb(var(--brand-secondary))]/50" onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={active.heading ?? 'Offer'}
        className="relative z-10 w-full max-w-lg animate-slide-up overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-lg bg-surface/80 p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
        >
          <X className="h-4 w-4" />
        </button>

        {active.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.imageUrl}
            alt={active.imageAlt ?? ''}
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        ) : null}

        <div className="space-y-4 p-6">
          {active.heading ? (
            <h2 className="font-heading text-xl font-bold text-content">{active.heading}</h2>
          ) : null}
          {active.body ? <p className="text-sm leading-relaxed text-muted">{active.body}</p> : null}

          {active.formSlug ? (
            <PublicFormLoader slug={active.formSlug} compact ctaLocation={`popup:${active.id}`} />
          ) : active.ctaUrl && active.ctaLabel ? (
            <Link href={active.ctaUrl} className={buttonClasses('primary', 'lg', 'w-full')} onClick={close}>
              {active.ctaLabel}
            </Link>
          ) : (
            <Button variant="outline" className="w-full" onClick={close}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
