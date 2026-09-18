import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/states';
import { formatBytes, formatDate, formatRelative } from '@/lib/utils/format';
import type { BackupDashboard } from '@/lib/backup/dashboard.service';

/**
 * The headline panel: is the site backed up, where do backups go, and is
 * anything about to stop them working.
 *
 * Warnings are shown here rather than buried in the history table because an
 * admin who never scrolls still needs to learn that pg_dump is missing.
 */
export function BackupOverview({ data }: { data: BackupDashboard }) {
  const { overview, config, storageKind, databaseTools, disk } = data;

  const diskLow =
    disk !== null && disk.totalBytes > 0 && disk.freeBytes / disk.totalBytes < 0.1;

  const stats: Array<{ label: string; value: string; hint?: string }> = [
    {
      label: 'Last successful backup',
      value: overview.lastSuccessfulAt ? formatRelative(overview.lastSuccessfulAt) : 'Never',
      hint: overview.lastSuccessfulAt ? formatDate(overview.lastSuccessfulAt, true) : undefined,
    },
    {
      label: 'Backups stored',
      value: String(overview.total),
      hint: `${formatBytes(overview.totalBytes)} total`,
    },
    {
      label: 'Storage',
      value: storageKind === 'S3' ? 'S3 / R2' : 'Local disk',
      hint: storageKind === 'S3' ? (config.bucket ?? 'No bucket set') : config.localPath,
    },
    {
      label: 'Next automatic backup',
      value: overview.scheduleEnabled
        ? overview.nextRunAt
          ? formatRelative(overview.nextRunAt)
          : 'Scheduling…'
        : 'Off',
      hint:
        overview.scheduleEnabled && overview.nextRunAt
          ? formatDate(overview.nextRunAt, true)
          : 'Enable a schedule below',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{stat.label}</p>
            <p className="mt-1.5 truncate text-lg font-semibold text-content" title={stat.value}>
              {stat.value}
            </p>
            {stat.hint ? (
              <p className="mt-0.5 truncate text-xs text-muted" title={stat.hint}>
                {stat.hint}
              </p>
            ) : null}
          </Card>
        ))}
      </div>

      {!databaseTools.available ? (
        <Alert tone="danger" title="Database backups are unavailable">
          The <code>pg_dump</code> and <code>pg_restore</code> tools are not installed in this
          container, so only media backups can run. Install the{' '}
          <code>postgresql-client</code> package in the image and redeploy.
        </Alert>
      ) : null}

      {!config.configured ? (
        <Alert tone="warning" title="Backup storage is not fully configured">
          {storageKind === 'S3'
            ? 'The S3 bucket, access key or secret is missing. Set BACKUP_S3_* in the environment.'
            : 'No local backup path is set. Backups will use the default directory.'}
        </Alert>
      ) : null}

      {storageKind === 'LOCAL' ? (
        <Alert tone={diskLow ? 'warning' : 'info'} title="Backups are stored on this container">
          {disk
            ? `${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}. `
            : ''}
          Mount <code>{config.localPath}</code> as a persistent volume, or the archives are lost
          the next time the container is replaced. Off-site copies belong in S3 or R2.
        </Alert>
      ) : null}

      {overview.running > 0 ? (
        <Alert tone="info" title="A backup is in progress">
          Refresh this page in a moment to see the result.
        </Alert>
      ) : null}
    </div>
  );
}
