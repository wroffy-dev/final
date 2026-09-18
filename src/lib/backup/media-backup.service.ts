import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { storage, uploadRoot } from '@/lib/storage';
import { ARCHIVE_PATHS } from './manifest';
import type { ArchiveEntry } from './archive';

/**
 * Collects uploaded media into the archive.
 *
 * Files are yielded one at a time as archive entries rather than gathered into
 * an array of buffers, so a library of several gigabytes streams into the ZIP
 * without ever being held in memory.
 *
 * Media *metadata* — rows, folders, alt text, every reference from a CMS
 * section — lives in the database dump, not here. This service only carries
 * the bytes, which is why a MEDIA-only backup is not restorable on its own
 * into an empty database.
 */

/**
 * Where locally-stored uploads live on disk.
 *
 * Resolved by the storage layer rather than re-derived here, so a backup and
 * the writer can never disagree about which directory holds the library — a
 * disagreement that would produce an archive with no media in it and no error
 * to show for it.
 */
export function localUploadRoot(): string {
  return uploadRoot();
}

export type MediaFileRef = { storageKey: string; archivePath: string };

/**
 * Every non-deleted media row, as an archive path.
 *
 * Driven from the database rather than from a directory listing: a stray file
 * on disk that no row points at is not part of the site, and restoring it
 * would resurrect content the admin deleted.
 */
export async function listMediaForBackup(): Promise<MediaFileRef[]> {
  const rows = await prisma.media.findMany({
    where: { deletedAt: null },
    select: { storageKey: true },
    orderBy: { createdAt: 'asc' },
  });

  return rows
    .filter((row) => row.storageKey && !row.storageKey.includes('..'))
    .map((row) => ({
      storageKey: row.storageKey,
      // The storage key is preserved verbatim inside the archive, so a restore
      // puts every file back exactly where its database row expects it and no
      // CMS reference breaks.
      archivePath: `${ARCHIVE_PATHS.mediaPrefix}${row.storageKey}`,
    }));
}

/**
 * Archive entries for the media library.
 *
 * Local files are referenced by path so archiver streams them straight off
 * disk. A remote (S3/R2) library is downloaded to a staging directory first —
 * archiver cannot read from a remote object — and the caller removes that
 * directory afterwards.
 */
export async function* mediaArchiveEntries(stagingDir: string): AsyncGenerator<ArchiveEntry> {
  const files = await listMediaForBackup();
  const provider = storage().provider;

  if (provider === 'local') {
    const root = localUploadRoot();
    for (const file of files) {
      const sourcePath = path.resolve(root, file.storageKey);
      // Skip a row whose file has gone missing rather than failing the whole
      // backup: an incomplete media set is far better than no backup at all,
      // and the manifest records what was actually included.
      const exists = await fsp
        .access(sourcePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) continue;
      yield { type: 'file', archivePath: file.archivePath, sourcePath };
    }
    return;
  }

  // Remote library: stage each object, then hand it to the archive.
  await fsp.mkdir(stagingDir, { recursive: true });
  for (const file of files) {
    const target = path.join(stagingDir, file.storageKey);
    try {
      const url = storage().publicUrl(file.storageKey);
      const response = await fetch(url);
      if (!response.ok || !response.body) continue;
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()));
      yield { type: 'file', archivePath: file.archivePath, sourcePath: target };
    } catch {
      // Same reasoning as above: one unreachable object must not abort the run.
      continue;
    }
  }
}

/** Total bytes of the media that would go into a backup, for the estimate. */
export async function mediaFootprint(): Promise<{ files: number; bytes: number }> {
  const result = await prisma.media.aggregate({
    where: { deletedAt: null },
    _count: { _all: true },
    _sum: { size: true },
  });
  return { files: result._count._all, bytes: Number(result._sum.size ?? 0) };
}
