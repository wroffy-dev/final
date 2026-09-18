import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { recordAudit } from '@/lib/services/audit';
import type { SessionUser } from '@/lib/auth/guards';
import type { BackupType, BackupOrigin, Backup } from '@prisma/client';
import { backupConfig, sanitiseError } from './config';
import { backupStorage, currentStorageKind } from './storage';
import { createArchive, type ArchiveEntry } from './archive';
import { checksumFile } from './checksum.service';
import { dumpDatabase } from './database-backup.service';
import { mediaArchiveEntries } from './media-backup.service';
import {
  ARCHIVE_PATHS,
  MANIFEST_VERSION,
  APPLICATION_ID,
  backupFileName,
  type BackupManifest,
} from './manifest';
import { withBackupLock } from './lock.service';

/**
 * Creating a backup.
 *
 * The Backup row is written *before* any work begins, so a container that is
 * killed mid-dump still leaves a visible record rather than silently nothing.
 * Everything after that updates the same row, and any failure marks it FAILED
 * with a sanitised message and removes the partial archive.
 */

const APP_VERSION = process.env.npm_package_version || '1.0.0';

export type CreateBackupOptions = {
  type: BackupType;
  origin?: BackupOrigin;
  actor?: SessionUser | null;
  /** Skips the lock. Only the restore flow uses this, already holding it. */
  assumeLocked?: boolean;
};

/** Creates a backup, holding the global lock for the duration. */
export async function createBackup(options: CreateBackupOptions): Promise<Backup> {
  if (options.assumeLocked) return runBackup(options);
  return withBackupLock(() => runBackup(options));
}

async function runBackup(options: CreateBackupOptions): Promise<Backup> {
  const { type, origin = 'MANUAL', actor } = options;
  const includeDatabase = type === 'FULL' || type === 'DATABASE';
  const includeMedia = type === 'FULL' || type === 'MEDIA';

  const fileName = backupFileName(type);
  const storageKey = `${new Date().getFullYear()}/${fileName}`;

  const backup = await prisma.backup.create({
    data: {
      type,
      origin,
      status: 'RUNNING',
      storage: currentStorageKind(),
      fileName,
      storageKey,
      automatic: origin !== 'MANUAL',
      databaseIncluded: includeDatabase,
      mediaIncluded: includeMedia,
      manifestVersion: MANIFEST_VERSION,
      appVersion: APP_VERSION,
      createdById: actor?.id ?? null,
      startedAt: new Date(),
    },
  });

  // Everything transient lives under one directory, removed in `finally`
  // whether the run succeeds or fails.
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'backup-'));
  const archivePath = path.join(workDir, fileName);
  const stagingDir = path.join(workDir, 'staging');

  try {
    const files: BackupManifest['files'] = [];
    let databaseChecksum = '';

    const entries: ArchiveEntry[] = [];

    if (includeDatabase) {
      const dumpPath = path.join(workDir, 'database.dump');
      await dumpDatabase(dumpPath);
      databaseChecksum = await checksumFile(dumpPath);
      const stat = await fsp.stat(dumpPath);
      files.push({ path: ARCHIVE_PATHS.databaseDump, size: stat.size });
      entries.push({
        type: 'file',
        archivePath: ARCHIVE_PATHS.databaseDump,
        sourcePath: dumpPath,
      });
    }

    const manifest: BackupManifest = {
      version: MANIFEST_VERSION,
      application: APPLICATION_ID,
      backupType: type,
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      databaseEngine: 'postgresql',
      databaseFormat: includeDatabase ? 'pg_custom' : 'none',
      mediaIncluded: includeMedia,
      databaseIncluded: includeDatabase,
      checksum: databaseChecksum,
      files,
      // Deliberately descriptive only. No environment variable, connection
      // string or key is ever written into a manifest.
      metadata: { origin, createdBy: actor?.email ?? null },
    };

    entries.push({
      type: 'content',
      archivePath: ARCHIVE_PATHS.manifest,
      content: JSON.stringify(manifest, null, 2),
    });

    // Media is generated lazily so files stream into the archive rather than
    // being listed into memory first.
    const allEntries = includeMedia
      ? concat(entries, mediaArchiveEntries(stagingDir))
      : entries;

    await createArchive(archivePath, allEntries);

    const checksum = await checksumFile(archivePath);
    const { size } = await backupStorage().upload(storageKey, fs.createReadStream(archivePath));

    const completed = await prisma.backup.update({
      where: { id: backup.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        sizeBytes: BigInt(size),
        checksum,
      },
    });

    await recordAudit({
      actor: actor ?? null,
      action: 'BACKUP_CREATED',
      entity: 'Backup',
      entityId: backup.id,
      summary: `${type} backup created (${fileName}, ${formatBytes(size)})`,
      after: { type, origin, fileName, checksum },
    });

    return completed;
  } catch (error) {
    const message = sanitiseError(error);

    // Remove the partial object so a failed run leaves nothing behind in
    // storage to be mistaken for a usable backup.
    await backupStorage()
      .delete(storageKey)
      .catch(() => undefined);

    const failed = await prisma.backup.update({
      where: { id: backup.id },
      data: { status: 'FAILED', failedAt: new Date(), errorMessage: message },
    });

    await recordAudit({
      actor: actor ?? null,
      action: 'BACKUP_FAILED',
      entity: 'Backup',
      entityId: backup.id,
      summary: `${type} backup failed: ${message}`,
    });

    return failed;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function* concat(
  first: ArchiveEntry[],
  rest: AsyncIterable<ArchiveEntry>,
): AsyncGenerator<ArchiveEntry> {
  for (const entry of first) yield entry;
  for await (const entry of rest) yield entry;
}

/** Deletes a backup and its archive. */
export async function deleteBackup(id: string, actor: SessionUser | null): Promise<void> {
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) throw new Error('That backup no longer exists.');

  // A run in flight owns its archive; removing it underneath would corrupt it.
  if (backup.status === 'RUNNING' || backup.status === 'RESTORING') {
    throw new Error('That backup is still in progress. Wait for it to finish.');
  }

  await prisma.backup.update({ where: { id }, data: { status: 'DELETING' } });

  try {
    if (backup.storageKey) await backupStorage().delete(backup.storageKey);
    await prisma.backup.delete({ where: { id } });

    await recordAudit({
      actor,
      action: 'BACKUP_DELETED',
      entity: 'Backup',
      entityId: id,
      summary: `Deleted backup ${backup.fileName ?? id}`,
    });
  } catch (error) {
    // Put the row back to a truthful state rather than leaving it DELETING.
    await prisma.backup.update({
      where: { id },
      data: { status: 'COMPLETED', errorMessage: sanitiseError(error) },
    });
    throw new Error(sanitiseError(error));
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Headline figures for the overview panel. */
export async function getBackupOverview() {
  const [latest, lastSuccessful, total, completedAggregate, schedule, running] = await Promise.all([
    prisma.backup.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.backup.findFirst({ where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } }),
    prisma.backup.count(),
    prisma.backup.aggregate({ where: { status: 'COMPLETED' }, _sum: { sizeBytes: true } }),
    prisma.backupSchedule.findUnique({ where: { id: 'singleton' } }),
    prisma.backup.count({ where: { status: { in: ['RUNNING', 'RESTORING', 'PENDING'] } } }),
  ]);

  return {
    latest,
    lastSuccessful,
    total,
    totalBytes: Number(completedAggregate._sum.sizeBytes ?? 0),
    scheduleEnabled: schedule?.enabled ?? false,
    nextRunAt: schedule?.nextRunAt ?? null,
    running,
  };
}
