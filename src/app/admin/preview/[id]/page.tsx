import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { getPageForPreview } from '@/lib/services/pages';
import { PreviewFrame } from '@/components/admin/preview-frame';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Authenticated preview of any page, published or not.
 *
 * The page itself renders at /preview/[id] inside an iframe — outside /admin so
 * the frame gets no admin chrome — which means the tablet and mobile widths
 * exercise the real media queries rather than just shrinking a div.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('pages.view');
  const { id } = await params;

  const page = await getPageForPreview(id);
  if (!page) notFound();

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950">
        <strong className="font-semibold">Preview</strong>
        <span className="min-w-0 truncate">
          “{page.title}”
          {page.status !== 'PUBLISHED' ? ' — draft changes are not on the live website yet' : ''}
        </span>
        <span className="shrink-0">
          <ContentStatusBadge status={page.status} />
        </span>
        <Link
          href={`/admin/pages/${page.id}`}
          className="ml-auto shrink-0 font-medium underline underline-offset-2"
        >
          Back to editor
        </Link>
      </div>

      <PreviewFrame src={`/preview/${page.id}`} title={`Preview of ${page.title}`} />
    </div>
  );
}
