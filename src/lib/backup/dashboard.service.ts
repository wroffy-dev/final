import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { describeBackupConfig } from './config';
import { databaseToolsAvailable } from './database-backup.service';
import { getBackupOverview } from './backup.service';
import { getSchedule } from './schedule.service';
import { isBackupLocked } from './lock.service';
import { backupStorage, currentStorageKind } from './storage';
import { LocalBackupStorage } from './storage/local.storage';
import { toBackupDto, toScheduleDto, type BackupDto, type BackupScheduleDto } from './serialize';
import type { BackupConfigSummary } from './config';

/**
 * Everything the Backup & Restore screen renders, gathered in one place so the
 * page component stays a thin shell rather than a data layer.
 */

export const HISTORY_PAGE_SIZE = 25;

export type BackupDashboard = {
  backups: BackupDto[];
  total: number;
  schedule: BackupScheduleDto;
  config: BackupConfigSummary;
  storageKind: 'LOCAL' | 'S3';
  databaseTools: { available: boolean; pgDump: boolean; pgRestore: boolean };
  busy: boolean;
  overview: {
    total: number;
    totalBytes: number;
    lastSuccessfulAt: string | null;
    nextRunAt: string | null;
    scheduleEnabled: boolean;
    running: number;
  };
  /** Local storage only — an S3 bucket has no meaningful free-space figure. */
  disk: { freeBytes: number; totalBytes: number } | null;
};

export async function getBackupDashboard(): Promise<BackupDashboard> {
  const [rows, overview, schedule, tools, busy] = await Promise.all([
    prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
      take: HISTORY_PAGE_SIZE,
      include: { createdBy: { select: { name: true } } },
    }),
    getBackupOverview(),
    getSchedule(),
    databaseToolsAvailable(),
    isBackupLocked(),
  ]);

  const storage = backupStorage();
  const disk = storage instanceof LocalBackupStorage ? await storage.diskSpace() : null;

  return {
    backups: rows.map(toBackupDto),
    total: overview.total,
    schedule: toScheduleDto(schedule),
    config: describeBackupConfig(),
    storageKind: currentStorageKind(),
    databaseTools: tools,
    busy,
    overview: {
      total: overview.total,
      totalBytes: overview.totalBytes,
      lastSuccessfulAt: overview.lastSuccessful?.completedAt?.toISOString() ?? null,
      nextRunAt: overview.nextRunAt ? overview.nextRunAt.toISOString() : null,
      scheduleEnabled: overview.scheduleEnabled,
      running: overview.running,
    },
    disk,
  };
}
