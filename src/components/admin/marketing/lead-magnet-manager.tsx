'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash, Gift } from 'lucide-react';
import { saveLeadMagnet, deleteLeadMagnet } from '@/lib/actions/campaigns';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { MediaPicker } from '@/components/admin/media-picker';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { slugify } from '@/lib/utils/slug';

export type LeadMagnetRow = {
  id: string;
  title: string;
  slug: string;
  kind: string;
  description: string | null;
  isActive: boolean;
  imageId: string | null;
  fileId: string | null;
  externalUrl: string | null;
  formId: string | null;
  ctaLabel: string;
  thankYouTitle: string | null;
  thankYouMessage: string | null;
  thankYouUrl: string | null;
  leadCount: number;
};

const KIND_LABELS: Record<string, string> = {
  EBOOK: 'eBook',
  PDF: 'PDF',
  GUIDE: 'Guide',
  CHECKLIST: 'Checklist',
  WHITEPAPER: 'Whitepaper',
  DEMO: 'Demo',
  CONSULTATION: 'Consultation',
  OFFER: 'Offer',
};

function blank(): LeadMagnetRow {
  return {
    id: '',
    title: '',
    slug: '',
    kind: 'PDF',
    description: '',
    isActive: true,
    imageId: null,
    fileId: null,
    externalUrl: '',
    formId: null,
    ctaLabel: 'Download',
    thankYouTitle: '',
    thankYouMessage: '',
    thankYouUrl: '',
    leadCount: 0,
  };
}

export function LeadMagnetManager({
  rows,
  forms,
  canEdit,
}: {
  rows: LeadMagnetRow[];
  forms: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<LeadMagnetRow | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<LeadMagnetRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const set = (patch: Partial<LeadMagnetRow>) =>
    setEditing((current) => (current ? { ...current, ...patch } : current));

  async function save() {
    if (!editing) return;
    setPending(true);
    setErrors({});
    const result = await saveLeadMagnet(editing.id || null, editing);
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

  return (
    <>
      {canEdit ? (
        <div className="mb-4">
          <Button onClick={() => setEditing(blank())}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New lead magnet
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Gift className="h-5 w-5" />}
          title="No lead magnets yet"
          description="Offer a guide or checklist in exchange for contact details, then place it with the Lead magnet block."
          action={canEdit ? <Button onClick={() => setEditing(blank())}>New lead magnet</Button> : undefined}
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[40rem]">
            <caption className="sr-only">Lead magnets</caption>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>Slug</Th>
                <Th align="center">Leads</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <span className="font-medium text-content">{row.title}</span>
                    {row.description ? (
                      <span className="block truncate text-xs text-muted">{row.description}</span>
                    ) : null}
                  </Td>
                  <Td className="text-sm text-muted">{KIND_LABELS[row.kind] ?? row.kind}</Td>
                  <Td>
                    <code className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">
                      {row.slug}
                    </code>
                  </Td>
                  <Td align="center" className="text-sm text-muted">
                    {row.leadCount}
                  </Td>
                  <Td>
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>
                      {row.isActive ? 'Active' : 'Off'}
                    </Badge>
                  </Td>
                  <Td align="right">
                    {canEdit ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          aria-label={`Edit ${row.title}`}
                          className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          aria-label={`Delete ${row.title}`}
                          className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
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
        title={editing?.id ? 'Edit lead magnet' : 'New lead magnet'}
        description="Reference the slug from the Lead magnet block to place it on a page."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !editing?.title.trim()}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save lead magnet'
              )}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="magnet-title" required error={errors.title}>
                <Input
                  id="magnet-title"
                  value={editing.title}
                  onChange={(e) =>
                    set({
                      title: e.target.value,
                      slug: editing.id ? editing.slug : slugify(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Type" htmlFor="magnet-kind">
                <Select id="magnet-kind" value={editing.kind} onChange={(e) => set({ kind: e.target.value })}>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Slug" htmlFor="magnet-slug" error={errors.slug}>
              <Input
                id="magnet-slug"
                value={editing.slug}
                onChange={(e) => set({ slug: e.target.value })}
                onBlur={(e) => set({ slug: slugify(e.target.value) })}
              />
            </Field>

            <Field label="Description" htmlFor="magnet-description">
              <Textarea
                id="magnet-description"
                rows={3}
                value={editing.description ?? ''}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cover image">
                <MediaPicker value={editing.imageId} onChange={(id) => set({ imageId: id })} label="Cover" />
              </Field>
              <Field label="File to deliver" hint="Upload the PDF or document.">
                <MediaPicker
                  value={editing.fileId}
                  onChange={(id) => set({ fileId: id })}
                  label="File"
                  kind="ALL"
                />
              </Field>
            </div>

            <Field
              label="External link"
              htmlFor="magnet-url"
              hint="Used instead of a file — for a booking page, say."
            >
              <Input
                id="magnet-url"
                value={editing.externalUrl ?? ''}
                onChange={(e) => set({ externalUrl: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Form" htmlFor="magnet-form" hint="Captures the lead before delivery.">
                <Select
                  id="magnet-form"
                  value={editing.formId ?? ''}
                  onChange={(e) => set({ formId: e.target.value || null })}
                >
                  <option value="">None</option>
                  {forms.map((form) => (<option key={form.id} value={form.id}>{form.name}</option>))}
                </Select>
              </Field>
              <Field label="Button label" htmlFor="magnet-cta">
                <Input
                  id="magnet-cta"
                  value={editing.ctaLabel}
                  onChange={(e) => set({ ctaLabel: e.target.value })}
                />
              </Field>
            </div>

            <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
              <legend className="px-1 text-sm font-medium text-content">After submission</legend>
              <Field label="Thank-you heading" htmlFor="magnet-ty-title">
                <Input
                  id="magnet-ty-title"
                  value={editing.thankYouTitle ?? ''}
                  onChange={(e) => set({ thankYouTitle: e.target.value })}
                />
              </Field>
              <Field label="Thank-you message" htmlFor="magnet-ty-message">
                <Textarea
                  id="magnet-ty-message"
                  rows={2}
                  value={editing.thankYouMessage ?? ''}
                  onChange={(e) => set({ thankYouMessage: e.target.value })}
                />
              </Field>
              <Field label="Thank-you page" htmlFor="magnet-ty-url" hint="Optional redirect after submitting.">
                <Input
                  id="magnet-ty-url"
                  value={editing.thankYouUrl ?? ''}
                  placeholder="/thank-you"
                  onChange={(e) => set({ thankYouUrl: e.target.value })}
                />
              </Field>
            </fieldset>

            <div className="rounded-lg border border-hairline p-4">
              <Switch
                checked={editing.isActive}
                onChange={(next) => set({ isActive: next })}
                label="Lead magnet is active"
              />
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setPending(true);
          const result = await deleteLeadMagnet(confirmDelete.id);
          setPending(false);
          setConfirmDelete(null);
          if (!result.ok) {
            toast(result.error, 'error');
            return;
          }
          toast(result.message ?? 'Deleted.');
          router.refresh();
        }}
        title="Delete this lead magnet?"
        message={
          confirmDelete
            ? `It stops being offered on the site. Its ${confirmDelete.leadCount} attributed lead(s) are kept.`
            : ''
        }
        pending={pending}
      />
    </>
  );
}
