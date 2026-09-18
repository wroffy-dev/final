'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash, Shuffle, ArrowRight } from 'lucide-react';
import { saveRedirect, toggleRedirect, deleteRedirect } from '@/lib/actions/seo';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { formatDate } from '@/lib/utils/format';

export type RedirectRow = {
  id: string;
  source: string;
  destination: string;
  type: string;
  isActive: boolean;
  hitCount: number;
  note: string | null;
  createdAt: string;
};

const BLANK = {
  id: '',
  source: '',
  destination: '',
  type: 'PERMANENT',
  isActive: true,
  note: '',
};

export function RedirectManager({ rows, canEdit }: { rows: RedirectRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<typeof BLANK | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<RedirectRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Done.');
    router.refresh();
    return true;
  }

  async function save() {
    if (!editing) return;
    setPending(true);
    setErrors({});

    const data = new FormData();
    data.set('source', editing.source);
    data.set('destination', editing.destination);
    data.set('type', editing.type);
    data.set('isActive', String(editing.isActive));
    data.set('note', editing.note);

    const result = await saveRedirect(editing.id || null, data);
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
          <Button onClick={() => setEditing({ ...BLANK })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New redirect
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Shuffle className="h-5 w-5" />}
          title="No redirects yet"
          description="Add one whenever a page URL changes, so existing links and search rankings survive."
          action={canEdit ? <Button onClick={() => setEditing({ ...BLANK })}>New redirect</Button> : undefined}
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[42rem]">
            <caption className="sr-only">Redirects</caption>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>To</Th>
                <Th align="center">Type</Th>
                <Th align="center">Hits</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <code className="font-mono text-xs text-content">{row.source}</code>
                    {row.note ? <span className="block text-xs text-muted">{row.note}</span> : null}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                      <code className="font-mono text-xs text-content">{row.destination}</code>
                    </span>
                  </Td>
                  <Td align="center">
                    <Badge tone={row.type === 'PERMANENT' ? 'brand' : 'neutral'}>
                      {row.type === 'PERMANENT' ? '301' : '302'}
                    </Badge>
                  </Td>
                  <Td align="center" className="text-sm text-muted">
                    {row.hitCount}
                  </Td>
                  <Td>
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>
                      {row.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-sm text-muted">{formatDate(row.createdAt)}</Td>
                  <Td align="right">
                    {canEdit ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => run(() => toggleRedirect(row.id))}
                          disabled={pending}
                          className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-muted/10 hover:text-content"
                        >
                          {row.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              id: row.id,
                              source: row.source,
                              destination: row.destination,
                              type: row.type,
                              isActive: row.isActive,
                              note: row.note ?? '',
                            })
                          }
                          aria-label={`Edit redirect from ${row.source}`}
                          className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          aria-label={`Delete redirect from ${row.source}`}
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
        title={editing?.id ? 'Edit redirect' : 'New redirect'}
        description="Requests to the old path are sent to the new one."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={pending || !editing?.source.trim() || !editing?.destination.trim()}
            >
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save redirect'
              )}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field
              label="Old path"
              htmlFor="redirect-source"
              required
              error={errors.source}
              hint="The URL that no longer exists, e.g. /old-pricing"
            >
              <Input
                id="redirect-source"
                value={editing.source}
                placeholder="/old-pricing"
                onChange={(e) => setEditing({ ...editing, source: e.target.value })}
              />
            </Field>
            <Field
              label="New destination"
              htmlFor="redirect-destination"
              required
              error={errors.destination}
              hint="An internal path or a full external URL."
            >
              <Input
                id="redirect-destination"
                value={editing.destination}
                placeholder="/pricing"
                onChange={(e) => setEditing({ ...editing, destination: e.target.value })}
              />
            </Field>
            <Field
              label="Type"
              htmlFor="redirect-type"
              hint="Use 301 for a permanent move — it passes search ranking to the new URL."
            >
              <Select
                id="redirect-type"
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value })}
              >
                <option value="PERMANENT">301 — permanent</option>
                <option value="TEMPORARY">302 — temporary</option>
              </Select>
            </Field>
            <Field label="Note" htmlFor="redirect-note" hint="Optional reminder of why this exists.">
              <Input
                id="redirect-note"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </Field>
            <div className="rounded-lg border border-hairline p-4">
              <Switch
                checked={editing.isActive}
                onChange={(next) => setEditing({ ...editing, isActive: next })}
                label="Redirect is active"
              />
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await run(() => deleteRedirect(confirmDelete.id));
          setConfirmDelete(null);
        }}
        title="Delete this redirect?"
        message="Visitors following the old link will get a 404 instead."
        pending={pending}
      />
    </>
  );
}
