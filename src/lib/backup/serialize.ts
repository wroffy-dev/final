import type { Backup, BackupRestore, BackupSchedule } from '@prisma/client';

/**
 * Backup rows carry `sizeBytes` as a BigInt because a full archive can exceed
 * the 2 GB an Int can hold. `JSON.stringify` throws on a BigInt, so every row
 * that crosses the wire or reaches a Client Component goes through here first.
 * Dates become ISO strings for the same reason.
 */

type Iso<T> = T extends Date ? string : T extends Date | null ? string | null : T;
type Dated<T> = { [K in keyof T]: Iso<T[K]> };

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export type BackupDto = Omit<Dated<Backup>, 'sizeBytes'> & {
  sizeBytes: number | null;
  createdByName: string | null;
};

export type BackupWithCreator = Backup & { createdBy?: { name: string | null } | null };

export function toBackupDto(backup: BackupWithCreator): BackupDto {
  const { createdBy, ...row } = backup;

  return {
    ...row,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    failedAt: iso(row.failedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: createdBy?.name ?? null,
  };
}

export type BackupRestoreDto = Dated<BackupRestore>;

export function toRestoreDto(restore: BackupRestore): BackupRestoreDto {
  return {
    ...restore,
    startedAt: restore.startedAt.toISOString(),
    completedAt: iso(restore.completedAt),
    failedAt: iso(restore.failedAt),
  };
}

export type BackupScheduleDto = Dated<BackupSchedule>;

export function toScheduleDto(schedule: BackupSchedule): BackupScheduleDto {
  return {
    ...schedule,
    lastRunAt: iso(schedule.lastRunAt),
    nextRunAt: iso(schedule.nextRunAt),
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}
