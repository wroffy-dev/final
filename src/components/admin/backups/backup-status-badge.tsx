import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { BackupStatus, BackupType, BackupOrigin } from '@prisma/client';

const STATUS: Record<BackupStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Pending', tone: 'neutral' },
  RUNNING: { label: 'Running', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  RESTORING: { label: 'Restoring', tone: 'warning' },
  DELETING: { label: 'Deleting', tone: 'neutral' },
};

export function BackupStatusBadge({ status }: { status: BackupStatus }) {
  const entry = STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

const TYPE_LABELS: Record<BackupType, string> = {
  FULL: 'Full',
  DATABASE: 'Database',
  MEDIA: 'Media',
};

export function BackupTypeBadge({ type }: { type: BackupType }) {
  return <Badge tone={type === 'FULL' ? 'brand' : 'neutral'}>{TYPE_LABELS[type] ?? type}</Badge>;
}

const ORIGIN_LABELS: Record<BackupOrigin, string> = {
  MANUAL: 'Manual',
  SCHEDULED: 'Scheduled',
  SAFETY: 'Safety',
  IMPORTED: 'Imported',
};

export function originLabel(origin: BackupOrigin): string {
  return ORIGIN_LABELS[origin] ?? origin;
}
