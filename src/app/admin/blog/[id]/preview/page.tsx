import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { PreviewFrame } from '@/components/admin/preview-frame';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';

export const metadata: Metadata = {
  title: 'Blog preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Authenticated preview of any article, published or not.
 *
 * The article renders at /preview/blog/[id] inside an iframe — outside /admin
 * so the frame gets no admin chrome — which means the tablet and mobile widths
 * exercise the real media queries rather than just shrinking a div.
 *
 * This is a blog-specific preview workflow, not a general live-preview window:
 * it opens from the post editor, targets one article, and closes back to it.
 */
export default async function BlogPreview({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('blog.view');
  const { id } = await params;

  const post = await prisma.blogPost.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, status: true },
  });
  if (!post) notFound();

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950">
        <strong className="font-semibold">Preview</strong>
        <span className="min-w-0 truncate">
          “{post.title}”
          {post.status !== 'PUBLISHED' ? ' — this draft is not on the live website yet' : ''}
        </span>
        <span className="shrink-0">
          <ContentStatusBadge status={post.status} />
        </span>
        <Link
          href={`/admin/blog/${post.id}`}
          className="ml-auto shrink-0 font-medium underline underline-offset-2"
        >
          Back to editor
        </Link>
      </div>

      <PreviewFrame src={`/preview/blog/${post.id}`} title={`Preview of ${post.title}`} />
    </div>
  );
}
