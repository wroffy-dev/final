'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Database, Download, HardDrive, Image as ImageIcon, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Alert, EmptyState } from '@/components/ui/states';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { RowMenu, RowMenuItem } from '@/components/admin/row-menu';
import { useToast } from '@/components/ui/toast';
import { formatBytes, formatDate } from '@/lib/utils/format';
import type { BackupDto } from '@/lib/backup/serialize';
import type { BackupDashboard } from '@/lib/backup/dashboard.service';
import { BackupStatusBadge, BackupTypeBadge, originLabel } from './backup-status-badge';

type Permissions = {
  create: boolean;
  download: boolean;
  restore: boolean;
  remove: boolean;
};

/**
 * Backup history and the actions on it.
 *
 * Every mutation goes through the REST routes rather than a Server Action: a
 * full backup or a restore can run for minutes, and the routes carry the
 * matching `maxDuration`. After each one the router is refreshed so the server
 * component re-reads the real state instead of this component guessing it.
 */
export function BackupManager({
  data,
  can,
}: {
  data: BackupDashboard;
  can: Permissions;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [pending, setPending] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<BackupDto | null>(null);
  const [toRestore, setToRestore] = React.useState<BackupDto | null>(null);
  const [toDelete, setToDelete] = React.useState<BackupDto | null>(null);
  const [confirmText, setConfirmText] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);

  const busy = pending !== null;
  const fileInput = React.useRef<HTMLInputElement>(null);

  async function call(
    label: string,
    input: RequestInfo,
    init: RequestInit,
    onDone?: (body: Record<string, unknown>) => void,
  ) {
    setPending(label);
    try {
      const response = await fetch(input, init);
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        toast(typeof body.error === 'string' ? body.error : 'That did not work.', 'error');
        return false;
      }
      onDone?.(body);
      router.refresh();
      return true;
    } catch {
      toast('The server could not be reached. Check your connection and try again.', 'error');
      return false;
    } finally {
      setPending(null);
    }
  }

  async function create(type: 'FULL' | 'DATABASE' | 'MEDIA') {
    const ok = await call(
      `create:${type}`,
      '/api/admin/backups',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type }),
      },
    );
    if (ok) toast('Backup created.');
  }

  async function runRestore() {
    if (!toRestore) return;
    const ok = await call(
      'restore',
      `/api/admin/backups/${toRestore.id}/restore`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESTORE' }),
      },
    );
    if (ok) {
      toast('Restore finished. A safety backup of the previous state was kept.');
      setToRestore(null);
      setConfirmText('');
    }
  }

  async function runDelete() {
    if (!toDelete) return;
    const ok = await call('delete', `/api/admin/backups/${toDelete.id}`, { method: 'DELETE' });
    if (ok) {
      toast('Backup deleted.');
      setToDelete(null);
    }
  }

  async function runImport(file: File) {
    const form = new FormData();
    form.append('file', file);
    const ok = await call('import', '/api/admin/backups/import', { method: 'POST', body: form });
    if (ok) {
      toast('Archive imported. Restore it when you are ready.');
      setImportOpen(false);
    }
  }

  const noDatabaseTools = !data.databaseTools.available;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Create a backup"
          description="Backups run on this server and can take a few minutes for a large media library."
          actions={
            can.create ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                disabled={busy}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import archive
              </Button>
            ) : null
          }
        />
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:p-5">
          <Button
            onClick={() => create('FULL')}
            disabled={!can.create || busy || data.busy || noDatabaseTools}
          >
            <HardDrive className="h-4 w-4" aria-hidden="true" />
            {pending === 'create:FULL' ? 'Backing up…' : 'Full backup'}
          </Button>
          <Button
            variant="outline"
            onClick={() => create('DATABASE')}
            disabled={!can.create || busy || data.busy || noDatabaseTools}
          >
            <Database className="h-4 w-4" aria-hidden="true" />
            {pending === 'create:DATABASE' ? 'Backing up…' : 'Database only'}
          </Button>
          <Button
            variant="outline"
            onClick={() => create('MEDIA')}
            disabled={!can.create || busy || data.busy}
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            {pending === 'create:MEDIA' ? 'Backing up…' : 'Media only'}
          </Button>
        </div>
        {data.busy ? (
          <div className="border-t border-hairline px-4 py-3 sm:px-5">
            <p className="text-xs text-muted">
              Another backup or restore is running. Only one can run at a time.
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Backup history"
          description={`${data.total} backup${data.total === 1 ? '' : 's'} stored.`}
        />
        {data.backups.length === 0 ? (
          <EmptyState
            icon={<HardDrive className="h-5 w-5" />}
            title="No backups yet"
            description="Create your first backup above. Then set a schedule so it keeps happening without you."
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th align="right">Size</Th>
                  <Th>Storage</Th>
                  <Th>Created by</Th>
                  <Th align="right">Duration</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.backups.map((backup) => (
                  <Tr key={backup.id}>
                    <Td>
                      <button
                        type="button"
                        className="text-left font-medium text-content hover:text-brand hover:underline"
                        onClick={() => setDetails(backup)}
                      >
                        {formatDate(backup.createdAt, true)}
                      </button>
                      <p className="text-xs text-muted">{originLabel(backup.origin)}</p>
                    </Td>
                    <Td>
                      <BackupTypeBadge type={backup.type} />
                    </Td>
                    <Td>
                      <BackupStatusBadge status={backup.status} />
                    </Td>
                    <Td align="right">
                      {backup.sizeBytes === null ? '—' : formatBytes(backup.sizeBytes)}
                    </Td>
                    <Td>{backup.storage === 'S3' ? 'S3 / R2' : 'Local'}</Td>
                    <Td className="truncate">{backup.createdByName ?? 'System'}</Td>
                    <Td align="right">{duration(backup)}</Td>
                    <Td align="right">
                      <div className="flex justify-end">
                        <RowMenu>
                          <RowMenuItem onClick={() => setDetails(backup)}>Details</RowMenuItem>
                          {can.download ? (
                            <RowMenuItem
                              disabled={backup.status !== 'COMPLETED'}
                              onClick={() => {
                                window.location.href = `/api/admin/backups/${backup.id}/download`;
                              }}
                            >
                              <Download className="h-4 w-4" aria-hidden="true" />
                              Download
                            </RowMenuItem>
                          ) : null}
                          {can.restore ? (
                            <RowMenuItem
                              disabled={backup.status !== 'COMPLETED' || busy || data.busy}
                              onClick={() => {
                                setConfirmText('');
                                setToRestore(backup);
                              }}
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                              Restore from this
                            </RowMenuItem>
                          ) : null}
                          {can.remove ? (
                            <RowMenuItem
                              tone="danger"
                              disabled={busy}
                              onClick={() => setToDelete(backup)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
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
        )}
      </Card>

      <BackupDetails backup={details} onClose={() => setDetails(null)} />

      <RestoreDialog
        backup={toRestore}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        pending={pending === 'restore'}
        onClose={() => {
          setToRestore(null);
          setConfirmText('');
        }}
        onConfirm={runRestore}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={runDelete}
        pending={pending === 'delete'}
        title="Delete this backup?"
        message="The archive is removed from storage permanently. If it is your most recent backup, take a new one first."
        confirmLabel="Delete backup"
      />

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import a backup archive"
        description="Upload a .zip produced by this system. It is validated and stored — nothing is restored until you choose to."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const file = fileInput.current?.files?.[0];
                if (!file) {
                  toast('Choose a .zip archive first.', 'error');
                  return;
                }
                void runImport(file);
              }}
              disabled={busy}
            >
              {pending === 'import' ? 'Uploading…' : 'Import'}
            </Button>
          </>
        }
      >
        <Field
          label="Archive"
          hint={`Up to ${formatBytes(data.config.maxImportBytes)}. Only .zip archives from this backup system are accepted.`}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="block w-full text-sm text-content file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand"
          />
        </Field>
      </Dialog>
    </div>
  );
}

function duration(backup: BackupDto): string {
  if (!backup.startedAt) return '—';
  const end = backup.completedAt ?? backup.failedAt;
  if (!end) return '—';
  const seconds = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(backup.startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function BackupDetails({ backup, onClose }: { backup: BackupDto | null; onClose: () => void }) {
  if (!backup) return null;

  const rows: Array<[string, React.ReactNode]> = [
    ['File', backup.fileName ?? '—'],
    ['Created', formatDate(backup.createdAt, true)],
    ['Type', backup.type],
    ['Origin', originLabel(backup.origin)],
    ['Contents', contents(backup)],
    ['Size', backup.sizeBytes === null ? '—' : formatBytes(backup.sizeBytes)],
    ['Storage', backup.storage === 'S3' ? 'S3 / R2' : 'Local disk'],
    ['Duration', duration(backup)],
    ['App version', backup.appVersion ?? '—'],
    ['Manifest version', backup.manifestVersion === null ? '—' : String(backup.manifestVersion)],
    [
      'Checksum (SHA-256)',
      backup.checksum ? (
        <code className="break-all text-xs">{backup.checksum}</code>
      ) : (
        '—'
      ),
    ],
  ];

  return (
    <Dialog open onClose={onClose} title="Backup details" size="lg">
      <dl className="divide-y divide-hairline text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 text-content">{value}</dd>
          </div>
        ))}
      </dl>
      {backup.errorMessage ? (
        <Alert tone="danger" title="This backup failed" className="mt-4">
          {backup.errorMessage}
        </Alert>
      ) : null}
    </Dialog>
  );
}

function contents(backup: BackupDto): string {
  const parts: string[] = [];
  if (backup.databaseIncluded) parts.push('Database');
  if (backup.mediaIncluded) parts.push('Media');
  return parts.length > 0 ? parts.join(' + ') : '—';
}

function RestoreDialog({
  backup,
  confirmText,
  onConfirmTextChange,
  pending,
  onClose,
  onConfirm,
}: {
  backup: BackupDto | null;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!backup) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Restore the website from this backup"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending || confirmText !== 'RESTORE'}>
            {pending ? 'Restoring…' : 'Restore now'}
          </Button>
        </>
      }
    >
      <Alert tone="warning" title="This replaces the live website">
        Everything created since {formatDate(backup.createdAt, true)} — pages, leads, customers,
        uploaded files — is replaced by the contents of this backup.
      </Alert>

      <ul className="mt-4 space-y-1.5 text-sm text-muted">
        <li>A safety backup of the current site is taken first, so this can be undone.</li>
        <li>The website is put into maintenance mode until the restore finishes.</li>
        <li>The archive checksum is verified before anything is written.</li>
      </ul>

      <Field
        label="Type RESTORE to confirm"
        className="mt-5"
        hint="Case sensitive."
      >
        <Input
          value={confirmText}
          onChange={(event) => onConfirmTextChange(event.target.value)}
          placeholder="RESTORE"
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
        />
      </Field>
    </Dialog>
  );
}
