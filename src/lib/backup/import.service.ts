import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { recordAudit } from '@/lib/services/audit';
import type { SessionUser } from '@/lib/auth/guards';
import type { Backup } from '@prisma/client';
import { backupConfig, sanitiseError } from './config';
import { backupStorage, currentStorageKind } from './storage';
import { checksumFile } from './checksum.service';
import { readArchiveEntry, listArchiveEntries, isSafeArchivePath } from './archive';
import { ARCHIVE_PATHS, readManifest, backupFileName } from './manifest';

/**
 * Importing an archive produced elsewhere.
 *
 * Validated but never restored: the archive lands in Backup History as a
 * COMPLETED, IMPORTED row, and an admin must explicitly choose to restore it.
 * Uploading and restoring in one step would make a single mis-click replace
 * the live site.
 */

export type ImportResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: string };

export async function importBackupArchive(
  file: File,
  actor: SessionUser | null,
): Promise<ImportResult> {
  const config = backupConfig();

  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > config.maxImportBytes) {
    const limitMb = Math.floor(config.maxImportBytes / (1024 * 1024));
    return { ok: false, error: `That archive is larger than the ${limitMb} MB import limit.` };
  }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return { ok: false, error: 'Only .zip backup archives can be imported.' };
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'import-'));
  const localPath = path.join(workDir, 'upload.zip');

  try {
    await fsp.writeFile(localPath, Buffer.from(await file.arrayBuffer()));

    // ---- Structure --------------------------------------------------------
    let entries: string[];
    try {
      entries = await listArchiveEntries(localPath);
    } catch {
      return { ok: false, error: 'That file is not a readable ZIP archive.' };
    }

    // A traversal entry means the archive is hostile or corrupt; refuse the
    // whole thing rather than importing it and skipping entries at restore.
    const unsafe = entries.filter((entry) => !isSafeArchivePath(entry));
    if (unsafe.length > 0) {
      return {
        ok: false,
        error: 'That archive contains unsafe file paths and was rejected.',
      };
    }

    if (!entries.includes(ARCHIVE_PATHS.manifest)) {
      return { ok: false, error: 'That archive does not contain a manifest.json.' };
    }

    // ---- Manifest ---------------------------------------------------------
    const manifestRaw = await readArchiveEntry(localPath, ARCHIVE_PATHS.manifest);
    if (!manifestRaw) return { ok: false, error: 'That archive does not contain a manifest.json.' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestRaw);
    } catch {
      return { ok: false, error: 'That archive does not contain a valid manifest.json.' };
    }

    const check = readManifest(parsed);
    if (!check.ok) return { ok: false, error: check.error };
    const manifest = check.manifest;

    // ---- Contents match the manifest's claims -----------------------------
    if (manifest.databaseIncluded && !entries.includes(ARCHIVE_PATHS.databaseDump)) {
      return {
        ok: false,
        error: 'That archive claims to contain a database but the dump is missing.',
      };
    }

    // ---- Store it ---------------------------------------------------------
    const checksum = await checksumFile(localPath);
    const fileName = backupFileName(manifest.backupType, new Date());
    const storageKey = `${new Date().getFullYear()}/imported-${fileName}`;

    const { size } = await backupStorage().upload(storageKey, fs.createReadStream(localPath));

    const backup = await prisma.backup.create({
      data: {
        type: manifest.backupType,
        origin: 'IMPORTED',
        status: 'COMPLETED',
        storage: currentStorageKind(),
        fileName,
        storageKey,
        sizeBytes: BigInt(size),
        checksum,
        manifestVersion: manifest.version,
        appVersion: manifest.appVersion || null,
        databaseIncluded: manifest.databaseIncluded,
        mediaIncluded: manifest.mediaIncluded,
        automatic: false,
        createdById: actor?.id ?? null,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await recordAudit({
      actor,
      action: 'BACKUP_IMPORTED',
      entity: 'Backup',
      entityId: backup.id,
      summary: `Imported ${manifest.backupType} backup ${file.name} (manifest v${manifest.version})`,
    });

    return { ok: true, backup };
  } catch (error) {
    return { ok: false, error: sanitiseError(error) };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
