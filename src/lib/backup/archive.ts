import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as archiver from 'archiver';
import yauzl from 'yauzl';
import { pipeline } from 'node:stream/promises';

/**
 * ZIP creation and extraction, streamed in both directions.
 *
 * Nothing here loads an archive into memory: a full backup of a media-heavy
 * site is routinely larger than the container's RAM limit.
 */

export type ArchiveEntry =
  | { type: 'file'; archivePath: string; sourcePath: string }
  | { type: 'content'; archivePath: string; content: string };

/**
 * Writes a ZIP to `outputPath`.
 *
 * Store-level compression on media is close to pointless — JPEG, PNG and WEBP
 * are already compressed — but the database dump and manifest benefit, so a
 * low level keeps CPU down while still shrinking the parts that compress.
 */
export async function createArchive(
  outputPath: string,
  entries: AsyncIterable<ArchiveEntry> | ArchiveEntry[],
): Promise<{ size: number }> {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  const output = fs.createWriteStream(outputPath);
  const archive = new archiver.ZipArchive({ zlib: { level: 6 } });

  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    // A missing file is a real problem during a backup, not something to skip
    // silently — surfacing it means the backup is marked FAILED rather than
    // quietly incomplete.
    archive.on('warning', (warning: Error) => reject(warning));
  });

  archive.pipe(output);

  for await (const entry of entries) {
    if (entry.type === 'content') {
      archive.append(entry.content, { name: entry.archivePath });
    } else {
      archive.file(entry.sourcePath, { name: entry.archivePath });
    }
  }

  await archive.finalize();
  await finished;

  const stat = await fsp.stat(outputPath);
  return { size: stat.size };
}

/**
 * Rejects an archive path that would escape the extraction directory.
 *
 * A ZIP entry name is attacker-controlled once an admin can import an archive,
 * and `../../etc/cron.d/x` in an entry name is the classic Zip Slip. Absolute
 * paths, drive letters and symlink-ish names are refused too.
 */
export function isSafeArchivePath(entryPath: string): boolean {
  if (!entryPath || entryPath.length > 1024) return false;
  // Reject absolute POSIX paths, Windows drive letters and UNC paths.
  if (entryPath.startsWith('/') || /^[a-zA-Z]:/.test(entryPath) || entryPath.startsWith('\\')) {
    return false;
  }
  if (entryPath.includes('\0')) return false;

  const normalised = path.posix.normalize(entryPath);
  if (normalised.startsWith('../') || normalised === '..' || normalised.startsWith('/')) {
    return false;
  }
  return !normalised.split('/').some((segment) => segment === '..');
}

/** Resolves an entry inside `root`, or null when it would escape. */
export function safeJoin(root: string, entryPath: string): string | null {
  if (!isSafeArchivePath(entryPath)) return null;
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, entryPath);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return full.startsWith(prefix) ? full : null;
}

export type ExtractResult = { extracted: number; skipped: string[] };

/**
 * Extracts an archive into `destination`.
 *
 * Entries whose names would escape the destination are skipped and reported
 * rather than silently dropped, so an import of a hostile archive is visible
 * in the result instead of looking like a clean success.
 */
export async function extractArchive(
  archivePath: string,
  destination: string,
  options: { filter?: (entryPath: string) => boolean } = {},
): Promise<ExtractResult> {
  await fsp.mkdir(destination, { recursive: true });

  const zip = await openZip(archivePath);
  const skipped: string[] = [];
  let extracted = 0;

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName;

      if (options.filter && !options.filter(name)) {
        zip.readEntry();
        return;
      }

      const target = safeJoin(destination, name);
      if (!target) {
        skipped.push(name);
        zip.readEntry();
        return;
      }

      // Directory entries end with a slash and carry no content.
      if (name.endsWith('/')) {
        fsp
          .mkdir(target, { recursive: true })
          .then(() => zip.readEntry())
          .catch(reject);
        return;
      }

      zip.openReadStream(entry, (error, readStream) => {
        if (error || !readStream) {
          reject(error ?? new Error('Could not read an entry from the archive.'));
          return;
        }
        fsp
          .mkdir(path.dirname(target), { recursive: true })
          .then(() => pipeline(readStream, fs.createWriteStream(target)))
          .then(() => {
            extracted += 1;
            zip.readEntry();
          })
          .catch(reject);
      });
    });

    zip.on('end', () => resolve());
    zip.on('error', reject);
    zip.readEntry();
  });

  return { extracted, skipped };
}

/** Reads one entry's contents as text, without extracting the whole archive. */
export async function readArchiveEntry(
  archivePath: string,
  entryPath: string,
): Promise<string | null> {
  const zip = await openZip(archivePath);

  return new Promise<string | null>((resolve, reject) => {
    let found = false;

    zip.on('entry', (entry: yauzl.Entry) => {
      if (entry.fileName !== entryPath) {
        zip.readEntry();
        return;
      }
      found = true;
      zip.openReadStream(entry, (error, readStream) => {
        if (error || !readStream) {
          reject(error ?? new Error('Could not read that archive entry.'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        readStream.on('data', (chunk: Buffer) => {
          // A manifest is small; a multi-megabyte one means a malformed or
          // hostile archive, so it is refused rather than buffered.
          size += chunk.length;
          if (size > 5 * 1024 * 1024) {
            reject(new Error('That archive entry is unexpectedly large.'));
            readStream.destroy();
            return;
          }
          chunks.push(chunk);
        });
        readStream.on('end', () => {
          zip.close();
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
        readStream.on('error', reject);
      });
    });

    zip.on('end', () => {
      if (!found) resolve(null);
    });
    zip.on('error', reject);
    zip.readEntry();
  });
}

/** Lists entry names without extracting, for validating an imported archive. */
export async function listArchiveEntries(archivePath: string): Promise<string[]> {
  const zip = await openZip(archivePath);
  const names: string[] = [];

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      names.push(entry.fileName);
      zip.readEntry();
    });
    zip.on('end', () => resolve());
    zip.on('error', reject);
    zip.readEntry();
  });

  return names;
}

function openZip(archivePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // lazyEntries drives the read one entry at a time rather than emitting the
    // whole directory at once; autoClose is off so the caller controls it.
    yauzl.open(archivePath, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) {
        reject(new Error('That file is not a readable ZIP archive.'));
        return;
      }
      resolve(zip);
    });
  });
}
