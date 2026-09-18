'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Pencil,
  ExternalLink,
  Copy,
  Trash,
  Star,
  Eye,
  Archive,
  Globe,
} from 'lucide-react';
import {
  setBlogPostStatus,
  duplicateBlogPost,
  duplicateBlogPostToCountry,
  deleteBlogPost,
  bulkBlogAction,
} from '@/lib/actions/blog';
import { RowMenu, RowMenuItem, BulkBar, useSelection } from '@/components/admin/row-menu';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils/format';

export type PostRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  isFeatured: boolean;
  imageUrl: string | null;
  categoryName: string | null;
  authorName: string | null;
  /** The market this article belongs to. */
  countryName: string;
  countryCode: string;
  countrySlug: string;
  readingTime: number;
  publishedAt: string | null;
  updatedAt: string;
};

export function PostsTable({
  rows,
  can,
  filtered,
  showCountry = false,
  countries = [],
}: {
  rows: PostRow[];
  can: { edit: boolean; create: boolean; delete: boolean; publish: boolean };
  filtered: boolean;
  /** Adds the Country column. Hidden on a single-market installation. */
  showCountry?: boolean;
  /** Markets an article can be copied into. */
  countries?: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const selection = useSelection(rows);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [confirmCopy, setConfirmCopy] = React.useState<{
    postId: string;
    countryId: string;
    name: string;
  } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  async function run(
    fn: () => Promise<{
      ok: boolean;
      error?: string;
      message?: string;
      fieldErrors?: Record<string, string[]>;
    }>,
  ) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    // An empty message means the action handed control to a confirmation
    // dialog rather than completing, so there is nothing to announce yet.
    if (result.message !== '') toast(result.message ?? 'Done.');
    router.refresh();
    return true;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title={filtered ? 'No posts match those filters' : 'No posts yet'}
        description={
          filtered
            ? 'Try clearing the search or the status filter.'
            : 'Write your first article to start building organic traffic.'
        }
        action={
          can.create ? (
            <ButtonLink href="/admin/blog/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New post
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {can.edit || can.delete ? (
        <div className="px-4 pt-4 sm:px-5">
          <BulkBar count={selection.selected.length} onClear={selection.clear}>
            {can.publish ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => bulkBlogAction({ ids: selection.selected, action: 'publish' })).then(
                    (ok) => ok && selection.clear(),
                  )
                }
              >
                Publish
              </Button>
            ) : null}
            {can.edit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => bulkBlogAction({ ids: selection.selected, action: 'draft' })).then(
                    (ok) => ok && selection.clear(),
                  )
                }
              >
                Unpublish
              </Button>
            ) : null}
            {can.edit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => bulkBlogAction({ ids: selection.selected, action: 'archive' })).then(
                    (ok) => ok && selection.clear(),
                  )
                }
              >
                Archive
              </Button>
            ) : null}
            {can.delete ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmBulkDelete(true)}>
                Delete
              </Button>
            ) : null}
          </BulkBar>
        </div>
      ) : null}

      <TableWrap>
        <Table className="min-w-[60rem]">
          <caption className="sr-only">Blog posts</caption>
          <thead>
            <tr>
              {can.edit ? (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    aria-label="Select all posts"
                    className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                  />
                </Th>
              ) : null}
              <Th className="w-14">
                <span className="sr-only">Image</span>
              </Th>
              <Th>Title</Th>
              {showCountry ? <Th>Country</Th> : null}
              <Th>Category</Th>
              <Th>Author</Th>
              <Th align="center">Featured</Th>
              <Th>Status</Th>
              <Th>Published</Th>
              <Th>Updated</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                {can.edit ? (
                  <Td>
                    <input
                      type="checkbox"
                      checked={selection.selected.includes(row.id)}
                      onChange={() => selection.toggle(row.id)}
                      aria-label={`Select ${row.title}`}
                      className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                    />
                  </Td>
                ) : null}
                <Td>
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="h-10 w-14 rounded-md border border-hairline object-cover"
                    />
                  ) : (
                    <span
                      className="block h-10 w-14 rounded-md border border-dashed border-hairline bg-muted/5"
                      aria-hidden="true"
                    />
                  )}
                </Td>
                <Td>
                  <Link href={`/admin/blog/${row.id}`} className="font-medium text-content hover:text-brand">
                    {row.title}
                  </Link>
                  <code className="mt-0.5 block font-mono text-xs text-muted">
                    /{[row.countrySlug, 'blog', row.slug].filter(Boolean).join('/')} ·{' '}
                    {row.readingTime} min
                  </code>
                </Td>
                {showCountry ? (
                  <Td className="whitespace-nowrap text-sm text-content">{row.countryName}</Td>
                ) : null}
                <Td className="text-sm text-muted">{row.categoryName ?? '—'}</Td>
                <Td className="text-sm text-muted">{row.authorName ?? '—'}</Td>
                <Td align="center">
                  {row.isFeatured ? (
                    <Star
                      className="mx-auto h-4 w-4 fill-amber-400 text-amber-400"
                      aria-label="Featured"
                    />
                  ) : (
                    <span className="text-muted" aria-hidden="true">
                      —
                    </span>
                  )}
                </Td>
                <Td>
                  <ContentStatusBadge status={row.status} />
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">
                  {row.publishedAt ? formatDate(row.publishedAt) : '—'}
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">{formatDate(row.updatedAt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    {can.edit ? (
                      <Link
                        href={`/admin/blog/${row.id}`}
                        className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        aria-label={`Edit ${row.title}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <Link
                      href={`/admin/blog/${row.id}/preview`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                      aria-label={`Preview ${row.title}`}
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    {row.status === 'PUBLISHED' ? (
                      <Link
                        href={`/${[row.countrySlug, 'blog', row.slug].filter(Boolean).join('/')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        aria-label={`View ${row.title}`}
                        title="View live"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <RowMenu label={`Actions for ${row.title}`}>
                      {can.publish && row.status !== 'PUBLISHED' ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() => run(() => setBlogPostStatus(row.id, 'PUBLISHED'))}
                        >
                          Publish
                        </RowMenuItem>
                      ) : null}
                      {can.edit && row.status === 'PUBLISHED' ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() => run(() => setBlogPostStatus(row.id, 'DRAFT'))}
                        >
                          Unpublish
                        </RowMenuItem>
                      ) : null}
                      {can.edit && row.status !== 'ARCHIVED' ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() => run(() => setBlogPostStatus(row.id, 'ARCHIVED'))}
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                          Archive
                        </RowMenuItem>
                      ) : null}
                      {can.create ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const result = await duplicateBlogPost(row.id);
                              if (result.ok && result.data) router.push(`/admin/blog/${result.data.id}`);
                              return result;
                            })
                          }
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplicate
                        </RowMenuItem>
                      ) : null}
                      {can.create
                        ? countries
                            .filter((country) => country.code !== row.countryCode)
                            .map((country) => (
                              <RowMenuItem
                                key={country.id}
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    const result = await duplicateBlogPostToCountry(
                                      row.id,
                                      country.id,
                                    );
                                    // Already there: ask before replacing it.
                                    if (!result.ok && result.fieldErrors?._confirm) {
                                      setConfirmCopy({
                                        postId: row.id,
                                        countryId: country.id,
                                        name: country.name,
                                      });
                                      return { ok: true, message: '' };
                                    }
                                    if (result.ok && result.data) {
                                      router.push(`/admin/blog/${result.data.id}`);
                                    }
                                    return result;
                                  })
                                }
                              >
                                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                                Copy to {country.name}
                              </RowMenuItem>
                            ))
                        : null}
                      {can.delete ? (
                        <RowMenuItem tone="danger" disabled={busy} onClick={() => setConfirmDelete(row.id)}>
                          <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </RowMenuItem>
                      ) : null}
                    </RowMenu>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <ConfirmDialog
        open={confirmCopy !== null}
        onClose={() => setConfirmCopy(null)}
        onConfirm={async () => {
          const target = confirmCopy;
          setConfirmCopy(null);
          if (!target) return;
          await run(async () => {
            const result = await duplicateBlogPostToCountry(target.postId, target.countryId, {
              replaceExisting: true,
            });
            if (result.ok && result.data) router.push(`/admin/blog/${result.data.id}`);
            return result;
          });
        }}
        title={`Replace the existing ${confirmCopy?.name ?? ''} article?`}
        message="That country already has an article at this URL. Its content, tags and SEO will be replaced by this one's, and it will be set back to draft."
        pending={busy}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await run(() => deleteBlogPost(confirmDelete));
          setConfirmDelete(null);
        }}
        title="Delete this post?"
        message="It is removed from the blog and the sitemap immediately."
        pending={busy}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async () => {
          const ok = await run(() => bulkBlogAction({ ids: selection.selected, action: 'delete' }));
          if (ok) selection.clear();
          setConfirmBulkDelete(false);
        }}
        title={`Delete ${selection.selected.length} post(s)?`}
        message="They are removed from the blog and the sitemap immediately."
        pending={busy}
      />
    </>
  );
}
