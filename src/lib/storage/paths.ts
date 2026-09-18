import path from 'node:path';

/**
 * Where local media lives, and the one guard that decides whether a key is
 * allowed to reach the disk.
 *
 * Deliberately free of `server-only` and of every heavy import: the writer, the
 * route that serves files, the rename action, the backup service and the boot
 * check all need these answers, and a second copy of a traversal check is one
 * copy too many.
 */

/**
 * The default upload root.
 *
 * Absolute and outside the application directory, because the alternative —
 * `public/uploads` inside the image — is destroyed by every rebuild and every
 * redeployment. A path under /data is the one a volume can be mounted at on a
 * VPS, in Docker, on Coolify and in Azure alike.
 */
export const DEFAULT_UPLOAD_DIR = '/data/uploads';

/**
 * Where uploads used to be written.
 *
 * Still read, never written. An installation that predates UPLOAD_DIR has files
 * here and rows in the database pointing at them; treating this as a read-only
 * fallback keeps every one of those images rendering without migrating a byte.
 */
export const LEGACY_UPLOAD_DIR = 'public/uploads';

/** The URL prefix local media is served under. */
export const DEFAULT_MEDIA_PUBLIC_PATH = '/media';

/** The URL prefix local media used to be served under. Still routed. */
export const LEGACY_MEDIA_PUBLIC_PATH = '/uploads';

/**
 * The directory uploads are written to.
 *
 * `LOCAL_UPLOAD_DIR` is honoured ahead of the default so an existing
 * deployment that set it keeps working untouched; `UPLOAD_DIR` is the name to
 * use from here on.
 */
export function uploadRoot(): string {
  const configured = (process.env.UPLOAD_DIR || process.env.LOCAL_UPLOAD_DIR || '').trim();
  return path.resolve(process.cwd(), configured || DEFAULT_UPLOAD_DIR);
}

/**
 * Directories searched when a file is not in the upload root.
 *
 * Read-only, and empty once the upload root *is* the legacy directory, so a
 * deployment that never moved pays nothing for this.
 */
export function legacyUploadRoots(): string[] {
  const primary = uploadRoot();
  const legacy = path.resolve(process.cwd(), LEGACY_UPLOAD_DIR);
  return legacy === primary ? [] : [legacy];
}

/** The URL prefix `publicUrl` builds and the media route answers on. */
export function mediaPublicPath(): string {
  const configured = (process.env.MEDIA_PUBLIC_PATH || '').trim();
  if (!configured) return DEFAULT_MEDIA_PUBLIC_PATH;
  const withSlash = configured.startsWith('/') ? configured : `/${configured}`;
  return withSlash.replace(/\/+$/, '') || DEFAULT_MEDIA_PUBLIC_PATH;
}

/**
 * A storage key, or null when it is not one this application wrote.
 *
 * An allowlist rather than a blocklist. Every key this application produces is
 * `YYYY/MM/slug-token.ext`, so the accepted alphabet is exactly what that
 * needs, and anything outside it — a percent sign left by an encoded traversal,
 * a backslash, a null byte, an absolute path, a `..` segment, a dotfile — is
 * refused before it is ever joined to a directory.
 *
 * Percent signs are rejected wholesale rather than decoded. Next has already
 * decoded a route parameter by the time it arrives, so a surviving `%` means
 * either double encoding or a key this application did not write; decoding it
 * again is how `%252e%252e` becomes `..` one layer too late.
 */
export function safeStorageKey(key: string): string | null {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key)) return null;

  const segments = key.split('/');
  for (const segment of segments) {
    // No empty segment (`a//b`), no `.` or `..`, and nothing hidden — a
    // leading dot is how a dotfile is written, and none of ours has one.
    if (!segment || segment === '.' || segment === '..') return null;
    if (segment.startsWith('.')) return null;
  }

  return segments.join('/');
}

/**
 * The absolute path `key` maps to inside `root`, or null.
 *
 * The prefix check is not redundant with `safeStorageKey`: a symlinked or
 * unusual root can still resolve outside itself, and this is the assertion that
 * a write or a read never lands anywhere but under the directory it was told
 * to use.
 */
export function resolveWithin(root: string, key: string): string | null {
  const safe = safeStorageKey(key);
  if (!safe) return null;

  const base = path.resolve(root);
  const target = path.resolve(base, safe);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}
