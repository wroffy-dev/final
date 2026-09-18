'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { TocItem } from '@/lib/cms/blog-toc';
import { cn } from '@/lib/utils/cn';

/**
 * Table of contents.
 *
 * Client-side for three reasons only: the collapse toggle, smooth scrolling,
 * and highlighting the heading currently in view. The list itself is rendered
 * from data the server already produced, so it is in the HTML either way.
 */
export function TableOfContents({
  items,
  heading,
  collapsible = true,
  openByDefault = true,
  className,
}: {
  items: TocItem[];
  heading?: string;
  collapsible?: boolean;
  openByDefault?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(openByDefault);
  const [active, setActive] = React.useState<string | null>(items[0]?.id ?? null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (items.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // A band near the top of the viewport: the heading you are reading under,
      // not whatever happens to be on screen.
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );

    for (const item of items) {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const label = heading || 'On this page';

  return (
    <nav aria-label={label} className={cn('blog-toc', className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="blog-toc__heading">{label}</span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      ) : (
        <p className="blog-toc__heading">{label}</p>
      )}

      <ol id={panelId} className={cn('blog-toc__list', collapsible && !open && 'hidden')}>
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'pl-4' : undefined}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'location' : undefined}
              className={cn('blog-toc__link', active === item.id && 'blog-toc__link--active')}
              onClick={(event) => {
                const target = document.getElementById(item.id);
                if (!target) return;
                event.preventDefault();
                setActive(item.id);
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Keep the URL shareable without triggering a jump.
                window.history.replaceState(null, '', `#${item.id}`);
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
