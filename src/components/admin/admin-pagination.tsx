import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';

export function AdminPagination({
  page,
  pages,
  total,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'page') search.set(key, value);
    }
    if (target > 1) search.set('page', String(target));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-hairline px-4 py-3 sm:flex-row sm:px-5">
      <p className="text-xs text-muted">
        {formatNumber(total)} {total === 1 ? 'result' : 'results'}
        {pages > 1 ? ` · page ${page} of ${pages}` : ''}
      </p>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <Link
            href={href(page - 1)}
            aria-disabled={page <= 1}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-sm text-content hover:bg-muted/10',
              page <= 1 && 'pointer-events-none opacity-40',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Prev
          </Link>
          <Link
            href={href(page + 1)}
            aria-disabled={page >= pages}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border border-hairline px-2.5 text-sm text-content hover:bg-muted/10',
              page >= pages && 'pointer-events-none opacity-40',
            )}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
