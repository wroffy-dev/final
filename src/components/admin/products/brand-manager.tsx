'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash, Building2 } from 'lucide-react';
import { saveBrand, deleteBrand } from '@/lib/actions/products';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { MediaPicker } from '@/components/admin/media-picker';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { slugify } from '@/lib/utils/slug';

export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  sortOrder: number;
  logoId: string | null;
  logoUrl: string | null;
  productCount: number;
};

const BLANK = {
  id: '',
  name: '',
  slug: '',
  description: '',
  websiteUrl: '',
  sortOrder: '0',
  logoId: null as string | null,
};

/**
 * Brand management.
 *
 * Mirrors the category manager so the two feel identical to use. Brands are a
 * second axis for filtering products, used by the product grid's "By brand"
 * source.
 */
export function BrandManager({
  rows,
  canEdit,
  canDelete,
}: {
  rows: BrandRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<typeof BLANK | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<BrandRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function save() {
    if (!editing) return;
    setPending(true);
    setErrors({});

    const data = new FormData();
    data.set('name', editing.name);
    data.set('slug', editing.slug);
    data.set('description', editing.description);
    data.set('websiteUrl', editing.websiteUrl);
    data.set('sortOrder', editing.sortOrder);
    data.set('logoId', editing.logoId ?? '');

    const result = await saveBrand(editing.id || null, data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    setEditing(null);
    router.refresh();
  }

  async function remove() {
    if (!confirmDelete) return;
    setPending(true);
    const result = await deleteBrand(confirmDelete.id);
    setPending(false);
    setConfirmDelete(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Deleted.');
    router.refresh();
  }

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No brands yet"
          description="Add a brand so products can be grouped and filtered by it on the website."
          action={
            canEdit ? (
              <Button onClick={() => setEditing({ ...BLANK })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New brand
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[38rem]">
              <caption className="sr-only">Brands</caption>
              <thead>
                <tr>
                  <Th>Brand</Th>
                  <Th align="center">Products</Th>
                  <Th align="center">Order</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <span className="flex items-center gap-3">
                        {row.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.logoUrl}
                            alt=""
                            aria-hidden="true"
                            className="h-8 w-8 shrink-0 rounded-md border border-hairline object-contain"
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-content">{row.name}</span>
                          <code className="block font-mono text-xs text-muted">{row.slug}</code>
                        </span>
                      </span>
                    </Td>
                    <Td align="center" className="text-sm text-muted">
                      {row.productCount}
                    </Td>
                    <Td align="center" className="text-sm text-muted">
                      {row.sortOrder}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                id: row.id,
                                name: row.name,
                                slug: row.slug,
                                description: row.description ?? '',
                                websiteUrl: row.websiteUrl ?? '',
                                sortOrder: String(row.sortOrder),
                                logoId: row.logoId,
                              })
                            }
                            aria-label={`Edit ${row.name}`}
                            title="Edit"
                            className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(row)}
                            aria-label={`Delete ${row.name}`}
                            title="Delete"
                            className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          {canEdit ? (
            <div className="border-t border-hairline p-4 sm:p-5">
              <Button variant="outline" onClick={() => setEditing({ ...BLANK })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New brand
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit brand' : 'New brand'}
        description="Brands group products so a section can show everything from one vendor."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !editing?.name.trim()}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save brand'
              )}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Name" htmlFor="brand-name" required error={errors.name}>
              <Input
                id="brand-name"
                value={editing.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    // Only auto-slug a brand that has never been saved.
                    slug: editing.id ? editing.slug : slugify(e.target.value),
                  })
                }
              />
            </Field>

            <Field label="URL slug" htmlFor="brand-slug" error={errors.slug}>
              <Input
                id="brand-slug"
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                onBlur={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                className="font-mono text-sm"
              />
            </Field>

            <Field label="Description" htmlFor="brand-description">
              <Textarea
                id="brand-description"
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>

            <Field label="Website" htmlFor="brand-website" error={errors.websiteUrl}>
              <Input
                id="brand-website"
                value={editing.websiteUrl}
                placeholder="https://"
                onChange={(e) => setEditing({ ...editing, websiteUrl: e.target.value })}
              />
            </Field>

            <Field label="Sort order" htmlFor="brand-order" hint="Lower numbers appear first.">
              <Input
                id="brand-order"
                type="number"
                min={0}
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
              />
            </Field>

            <Field label="Logo">
              <MediaPicker
                value={editing.logoId}
                onChange={(logoId) => setEditing({ ...editing, logoId })}
                label="Logo"
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Delete this brand?"
        message={
          confirmDelete
            ? confirmDelete.productCount > 0
              ? `${confirmDelete.productCount} product(s) use this brand. They are kept, but lose their brand.`
              : 'This brand is not used by any product.'
            : ''
        }
        pending={pending}
      />
    </>
  );
}
