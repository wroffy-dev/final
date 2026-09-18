'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash, Tag } from 'lucide-react';
import { saveProductCategory, deleteProductCategory } from '@/lib/actions/products';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { MediaPicker } from '@/components/admin/media-picker';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { slugify } from '@/lib/utils/slug';

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  imageId: string | null;
  productCount: number;
};

const BLANK = { id: '', name: '', slug: '', description: '', sortOrder: '0', imageId: null as string | null };

export function CategoryManager({ rows, canEdit, canDelete }: {
  rows: CategoryRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<typeof BLANK | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<CategoryRow | null>(null);
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
    data.set('sortOrder', editing.sortOrder);
    data.set('imageId', editing.imageId ?? '');

    const result = await saveProductCategory(editing.id || null, data);
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
    const result = await deleteProductCategory(confirmDelete.id);
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
      {canEdit ? (
        <div className="mb-4">
          <Button onClick={() => setEditing({ ...BLANK })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New category
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-5 w-5" />}
          title="No categories yet"
          description="Categories let a product block pull “all products in this category”."
          action={
            canEdit ? <Button onClick={() => setEditing({ ...BLANK })}>New category</Button> : undefined
          }
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[36rem]">
            <caption className="sr-only">Product categories</caption>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>URL</Th>
                <Th align="center">Products</Th>
                <Th align="center">Order</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <span className="font-medium text-content">{row.name}</span>
                    {row.description ? (
                      <span className="block text-xs text-muted">{row.description}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <code className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">
                      {row.slug}
                    </code>
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
                              sortOrder: String(row.sortOrder),
                              imageId: row.imageId,
                            })
                          }
                          aria-label={`Edit ${row.name}`}
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
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'New category'}
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
                'Save category'
              )}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Name" htmlFor="cat-name" required error={errors.name}>
              <Input
                id="cat-name"
                value={editing.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    slug: editing.id ? editing.slug : slugify(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="URL slug" htmlFor="cat-slug" error={errors.slug}>
              <Input
                id="cat-slug"
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                onBlur={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
              />
            </Field>
            <Field label="Description" htmlFor="cat-description">
              <Textarea
                id="cat-description"
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <Field label="Sort order" htmlFor="cat-order" hint="Lower numbers appear first.">
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
              />
            </Field>
            <Field label="Image">
              <MediaPicker
                value={editing.imageId}
                onChange={(id) => setEditing({ ...editing, imageId: id })}
                label="Category image"
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Delete this category?"
        message={
          confirmDelete && confirmDelete.productCount > 0
            ? `${confirmDelete.productCount} product(s) will become uncategorised. The products themselves are not deleted.`
            : 'The category will be removed.'
        }
        pending={pending}
      />
    </>
  );
}
