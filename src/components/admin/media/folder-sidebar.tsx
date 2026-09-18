'use client';

import * as React from 'react';
import { Folder, FolderOpen, FolderPlus, Pencil, Trash, Images, Inbox } from 'lucide-react';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  saveMediaFolder,
  deleteMediaFolder,
  type MediaFolderNode,
} from '@/lib/actions/media-folders';
import { flattenTree, descendantIds, ancestorPath } from '@/lib/utils/tree';
import { cn } from '@/lib/utils/cn';

/** 'ALL' shows everything; 'NONE' shows items in no folder. */
export type FolderSelection = string | 'ALL' | 'NONE';

/**
 * Folder tree for the media library.
 *
 * Folders are a filing layer only — nothing here moves a file in storage, so a
 * URL already embedded in a page keeps working however the library is
 * reorganised.
 */
export function FolderSidebar({
  folders,
  selected,
  onSelect,
  canEdit,
  canDelete,
  onChanged,
  totalCount,
  uncategorisedCount,
}: {
  folders: MediaFolderNode[];
  selected: FolderSelection;
  onSelect: (next: FolderSelection) => void;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
  totalCount: number;
  uncategorisedCount: number;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<{
    id: string;
    name: string;
    parentId: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<MediaFolderNode | null>(null);
  const [pending, setPending] = React.useState(false);

  const ordered = React.useMemo(
    () => flattenTree(folders, (a, b) => a.name.localeCompare(b.name)),
    [folders],
  );

  /** Never offer a folder its own subtree as a parent. */
  const parentOptions = React.useMemo(() => {
    const excluded = editing?.id
      ? new Set([editing.id, ...descendantIds(folders, editing.id)])
      : new Set<string>();
    return ordered.filter((entry) => !excluded.has(entry.node.id));
  }, [ordered, folders, editing]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Saved.');
    onChanged();
    return true;
  }

  return (
    <>
      <nav aria-label="Media folders" className="space-y-0.5">
        <FolderButton
          label="All media"
          count={totalCount}
          icon={<Images className="h-4 w-4" aria-hidden="true" />}
          active={selected === 'ALL'}
          onClick={() => onSelect('ALL')}
        />
        <FolderButton
          label="Uncategorised"
          count={uncategorisedCount}
          icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
          active={selected === 'NONE'}
          onClick={() => onSelect('NONE')}
        />

        {ordered.length > 0 ? <div className="my-2 border-t border-hairline" /> : null}

        {ordered.map(({ node, depth }) => {
          const active = selected === node.id;
          return (
            <div
              key={node.id}
              className="group flex items-center gap-0.5"
              style={{ paddingLeft: `${depth * 0.75}rem` }}
            >
              <FolderButton
                label={node.name}
                count={node.fileCount}
                icon={
                  active ? (
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Folder className="h-4 w-4" aria-hidden="true" />
                  )
                }
                active={active}
                onClick={() => onSelect(node.id)}
              />
              {canEdit ? (
                <button
                  type="button"
                  onClick={() =>
                    setEditing({ id: node.id, name: node.name, parentId: node.parentId ?? '' })
                  }
                  aria-label={`Rename ${node.name}`}
                  className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-muted/10 hover:text-content focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(node)}
                  aria-label={`Delete ${node.name}`}
                  className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}

        {canEdit ? (
          <button
            type="button"
            onClick={() =>
              setEditing({
                id: '',
                name: '',
                // A new folder defaults into whatever is open, so "New folder"
                // while inside Dropbox creates Dropbox → …
                parentId: selected !== 'ALL' && selected !== 'NONE' ? selected : '',
              })
            }
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-brand transition-colors hover:bg-brand/5"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            New folder
          </button>
        ) : null}
      </nav>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Rename folder' : 'New folder'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || !editing?.name.trim()}
              onClick={async () => {
                if (!editing) return;
                const ok = await run(() =>
                  saveMediaFolder(editing.id || null, {
                    name: editing.name,
                    parentId: editing.parentId,
                  }),
                );
                if (ok) setEditing(null);
              }}
            >
              {pending ? 'Saving…' : 'Save folder'}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Folder name" htmlFor="folder-name" required>
              <Input
                id="folder-name"
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </Field>
            <Field
              label="Inside"
              htmlFor="folder-parent"
              hint="Leave empty to create a top-level folder."
            >
              <Select
                id="folder-parent"
                value={editing.parentId}
                onChange={(event) => setEditing({ ...editing, parentId: event.target.value })}
              >
                <option value="">Media (top level)</option>
                {parentOptions.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {`${'— '.repeat(depth)}${node.name}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          const ok = await run(() => deleteMediaFolder(confirmDelete.id));
          setConfirmDelete(null);
          if (ok && selected === confirmDelete.id) onSelect('ALL');
        }}
        title={confirmDelete ? `Delete “${confirmDelete.name}”?` : ''}
        message={
          confirmDelete
            ? `No file is deleted. Its ${confirmDelete.fileCount} file(s) and any subfolders move up one level.`
            : ''
        }
        confirmLabel="Delete folder"
        pending={pending}
      />
    </>
  );
}

function FolderButton({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        active ? 'bg-brand/10 font-medium text-brand' : 'text-content hover:bg-muted/[0.07]',
      )}
    >
      <span className={active ? 'text-brand' : 'text-muted'}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted">{count}</span>
    </button>
  );
}

/** Breadcrumb trail for the open folder. */
export function FolderBreadcrumb({
  folders,
  selected,
  onSelect,
}: {
  folders: MediaFolderNode[];
  selected: FolderSelection;
  onSelect: (next: FolderSelection) => void;
}) {
  const trail = selected === 'ALL' || selected === 'NONE' ? [] : ancestorPath(folders, selected);

  return (
    <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onSelect('ALL')}
        className="rounded px-1 text-muted transition-colors hover:text-content"
      >
        {selected === 'NONE' ? 'All media' : 'Media'}
      </button>
      {selected === 'NONE' ? (
        <>
          <span className="text-muted">/</span>
          <span className="font-medium text-content">Uncategorised</span>
        </>
      ) : null}
      {trail.map((node, index) => (
        <React.Fragment key={node.id}>
          <span className="text-muted">/</span>
          {index === trail.length - 1 ? (
            <span className="font-medium text-content">{node.name}</span>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className="rounded px-1 text-muted transition-colors hover:text-content"
            >
              {node.name}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
