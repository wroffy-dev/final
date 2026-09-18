import { z } from 'zod';

/**
 * manifest.json — the contract between an archive and the code that restores it.
 *
 * Versioned from the start. An archive written by a future release may carry a
 * structure this build does not understand, so the version is checked before
 * anything is extracted and an unsupported one is refused with a plain message
 * rather than failing somewhere deep in the restore.
 */

/** The manifest version this build writes. */
export const MANIFEST_VERSION = 1;

/** Versions this build can read. Older formats stay listed as support is added. */
export const SUPPORTED_MANIFEST_VERSIONS = [1];

/** Identifies archives from this application; refuses another app's backup. */
export const APPLICATION_ID = 'dropbox-reseller';

export const manifestSchema = z.object({
  version: z.number().int().positive(),
  application: z.string().min(1),
  backupType: z.enum(['FULL', 'DATABASE', 'MEDIA']),
  createdAt: z.string(),
  appVersion: z.string().default(''),
  databaseEngine: z.string().default('postgresql'),
  /** `pg_custom` is a pg_dump -Fc archive; `none` means database-free. */
  databaseFormat: z.enum(['pg_custom', 'none']).default('none'),
  mediaIncluded: z.boolean().default(false),
  databaseIncluded: z.boolean().default(false),
  /**
   * SHA-256 of the database dump inside the archive, when there is one. The
   * archive's own checksum is stored on the Backup row instead — a file cannot
   * contain its own hash.
   */
  checksum: z.string().default(''),
  files: z
    .array(z.object({ path: z.string(), size: z.number().int().nonnegative() }))
    .default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type BackupManifest = z.infer<typeof manifestSchema>;

export const UNSUPPORTED_VERSION_MESSAGE =
  'This backup format is not supported by the current application version.';

export type ManifestCheck =
  | { ok: true; manifest: BackupManifest }
  | { ok: false; error: string };

/**
 * Parses and validates a manifest read out of an archive.
 *
 * Order matters: shape, then application, then version. A file that is not a
 * manifest at all should not produce a confusing "unsupported version".
 */
export function readManifest(raw: unknown): ManifestCheck {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'That archive does not contain a valid manifest.json.' };
  }

  if (parsed.data.application !== APPLICATION_ID) {
    return { ok: false, error: 'That backup was created by a different application.' };
  }

  if (!SUPPORTED_MANIFEST_VERSIONS.includes(parsed.data.version)) {
    return { ok: false, error: UNSUPPORTED_VERSION_MESSAGE };
  }

  return { ok: true, manifest: parsed.data };
}

/** Paths inside the archive. Fixed, so a restore knows where to look. */
export const ARCHIVE_PATHS = {
  manifest: 'backup/manifest.json',
  databaseDump: 'backup/database/database.dump',
  mediaPrefix: 'backup/media/',
} as const;

/** dropbox-reseller-full-2026-09-11-103000.zip */
export function backupFileName(type: 'FULL' | 'DATABASE' | 'MEDIA', when = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${APPLICATION_ID}-${type.toLowerCase()}-${stamp}.zip`;
}
