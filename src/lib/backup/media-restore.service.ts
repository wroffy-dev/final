import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { storage } from '@/lib/storage';
import { ARCHIVE_PATHS } from './manifest';
import { extractArchive, safeJoin } from './archive';
import { localUploadRoot } from './media-backup.service';

/**
 * Puts uploaded files back.
 *
 * Storage keys are preserved exactly, which is what keeps every CMS reference
 * intact: a section pointing at `2026/03/hero-a1b2.webp` finds the same key
 * after a restore, whatever folder the admin has since filed it under. Folder
 * structure and media IDs live in the database dump and come back with it.
 */

export type MediaRestoreResult = {
  restored: number;
  skipped: string[];
  /** True when the archive carried no media section at all. */
  empty: boolean;
};

/**
 * Extracts the archive's media into a staging directory, then publishes it.
 *
 * Staging first, rather than writing straight over the live upload directory,
 * means a malformed or partially-readable archive cannot leave the library in
 * a half-overwritten state.
 */
export async function restoreMedia(
  archivePath: string,
  stagingDir: string,
): Promise<MediaRestoreResult> {
  await fsp.mkdir(stagingDir, { recursive: true });

  const extraction = await extractArchive(archivePath, stagingDir, {
    filter: (entryPath) => entryPath.startsWith(ARCHIVE_PATHS.mediaPrefix),
  });

  const mediaRoot = path.join(stagingDir, ARCHIVE_PATHS.mediaPrefix);
  const staged = await collectFiles(mediaRoot);
  if (staged.length === 0) {
    return { restored: 0, skipped: extraction.skipped, empty: true };
  }

  const provider = storage().provider;
  const skipped = [...extraction.skipped];
  let restored = 0;

  if (provider === 'local') {
    const destinationRoot = localUploadRoot();
    await fsp.mkdir(destinationRoot, { recursive: true });

    for (const relative of staged) {
      // Re-checked at the point of writing, not only at extraction: this is
      // the call that actually touches the live upload directory.
      const target = safeJoin(destinationRoot, relative);
      if (!target) {
        skipped.push(relative);
        continue;
      }
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(path.join(mediaRoot, relative), target);
      restored += 1;
    }

    return { restored, skipped, empty: false };
  }

  // Remote library: upload each staged file back under its original key.
  for (const relative of staged) {
    if (relative.includes('..')) {
      skipped.push(relative);
      continue;
    }
    const source = path.join(mediaRoot, relative);
    const body = await fsp.readFile(source);
    await storage().put({
      key: relative,
      body,
      mimeType: guessMimeType(relative),
    });
    restored += 1;
  }

  return { restored, skipped, empty: false };
}

/** Relative paths of every file under `root`. */
async function collectFiles(root: string, base = ''): Promise<string[]> {
  const entries = await fsp.readdir(path.join(root, base), { withFileTypes: true }).catch(() => []);
  const out: string[] = [];

  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(root, relative)));
    } else if (entry.isFile()) {
      out.push(relative);
    }
    // Symlinks are ignored: a link inside an archive is a way out of the
    // destination directory.
  }

  return out;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function guessMimeType(filePath: string): string {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Frees a staging directory. Never throws — cleanup must not fail a restore. */
export async function removeStaging(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** True when `dir` exists and holds at least one entry. */
export async function directoryHasContent(dir: string): Promise<boolean> {
  try {
    const entries = await fsp.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}
