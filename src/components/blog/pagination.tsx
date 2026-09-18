import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Server-rendered pagination.
 *
 * Real links with real hrefs: crawlable, shareable and working without
 * JavaScript. The labels and the number row are CMS-configurable; the windowing
 * (first, last and the pages around the current one) is not, because it exists
 * to stop a 200-page blog rendering 200 links.
 */
export function Pagination({
  page,
  pages,
  basePath,
  searchParams = {},
  previousLabel = 'Previous',
  nextLabel = 'Next',
  showNumbers = true,
  showSummary = false,
  align = 'center',
  className,
}: {
  page: number;
  pages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  previousLabel?: string;
  nextLabel?: string;
  showNumbers?: boolean;
  showSummary?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  if (pages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set('page', String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  );

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center gap-1.5',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
        className,
      )}
    >
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        rel="prev"
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-lg border border-hairline px-3 text-sm text-content transition-colors hover:bg-muted/10',
          page === 1 && 'pointer-events-none opacity-40',
        )}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{previousLabel}</span>
      </Link>

      {showNumbers
        ? numbers.map((n, index) => (
            <span key={n} className="flex items-center gap-1.5">
              {index > 0 && n - (numbers[index - 1] ?? 0) > 1 ? (
                <span className="px-1 text-sm text-muted" aria-hidden="true">
                  …
                </span>
              ) : null}
              <Link
                href={href(n)}
                aria-current={n === page ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm transition-colors',
                  n === page
                    ? 'border-brand bg-brand text-white'
                    : 'border-hairline text-content hover:bg-muted/10',
                )}
              >
                {n}
              </Link>
            </span>
          ))
        : null}

      {showSummary ? (
        <span className="px-2 text-sm text-muted">
          Page {page} of {pages}
        </span>
      ) : null}

      <Link
        href={href(Math.min(pages, page + 1))}
        aria-disabled={page === pages}
        rel="next"
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-lg border border-hairline px-3 text-sm text-content transition-colors hover:bg-muted/10',
          page === pages && 'pointer-events-none opacity-40',
        )}
      >
        <span className="hidden sm:inline">{nextLabel}</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}
