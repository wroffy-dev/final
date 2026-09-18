import { Skeleton, TableSkeleton } from '@/components/ui/states';

/**
 * Route-level loading shapes.
 *
 * Every admin route renders on the server on demand, so a click otherwise sits
 * on the old page with nothing happening until the query returns. These give
 * that wait a shape that matches what is arriving, rather than a spinner that
 * says only "something is happening".
 *
 * Each is wrapped by Next in a Suspense boundary, so the shell — sidebar, top
 * bar, breadcrumbs — stays interactive while only the page body swaps.
 */

function PageHeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

/** A filtered list: header, filter bar, then rows. */
export function ListPageSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <PageHeaderSkeleton />
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-full sm:w-64" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-xl border border-hairline">
        <TableSkeleton rows={8} cols={cols} />
      </div>
    </div>
  );
}

/** A dashboard: KPI row, then charts. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <PageHeaderSkeleton />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

/** A single record or settings screen: tabs, then a form. */
export function FormPageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-10 w-full max-w-md" />
      <div className="space-y-4 rounded-xl border border-hairline p-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The media grid. */
export function MediaSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-10 w-full max-w-sm" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square" />
        ))}
      </div>
    </div>
  );
}
