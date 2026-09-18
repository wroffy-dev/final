import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  legacyUploadRoots,
  mediaPublicPath,
  resolveWithin,
  uploadRoot,
} from './paths';
import type { StorageHealth, StorageService, StoredFile } from './types';

/**
 * Filesystem-backed storage.
 *
 * The default for every deployment, and the only one that needs no account
 * anywhere: point `UPLOAD_DIR` at a mounted volume and the media library works
 * on a laptop, a VPS, Docker, Coolify and Azure Container Apps alike. Nothing
 * in this class knows which of those it is running on — that is the whole
 * point of the separation, and it is why no cloud SDK appears here.
 *
 * Writes only ever go to the upload root. Reads and deletes also look in the
 * legacy `public/uploads` directory, so an installation that predates
 * `UPLOAD_DIR` keeps serving every file it already had without a migration.
 */
export class LocalStorage implements StorageService {
  readonly provider = 'local' as const;

  constructor(private readonly dir?: string) {}

  /** The directory uploads are written to. */
  private root(): string {
    return this.dir ? path.resolve(process.cwd(), this.dir) : uploadRoot();
  }

  /**
   * The absolute path a key maps to under the upload root, or null when the
   * key is not one this application would have written.
   *
   * Public because the route that serves these files needs the same guard.
   */
  resolve(key: string): string | null {
    return resolveWithin(this.root(), key);
  }

  /**
   * Where a key's file actually is: the upload root, or a legacy directory.
   *
   * Returns null when the key is unsafe or the file is nowhere. Used by reads,
   * deletes and renames, so each of them keeps working across the move from
   * `public/uploads` to `UPLOAD_DIR`.
   */
  async locate(key: string): Promise<string | null> {
    for (const root of [this.root(), ...legacyUploadRoots()]) {
      const target = resolveWithin(root, key);
      if (!target) continue;
      const found = await fs
        .stat(target)
        .then((info) => info.isFile())
        .catch(() => false);
      if (found) return target;
    }
    return null;
  }

  private absolute(key: string): string {
    const target = this.resolve(key);
    if (!target) throw new Error('Invalid storage key');
    return target;
  }

  async put({
    key,
    body,
    mimeType,
  }: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredFile> {
    const target = this.absolute(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return {
      key,
      url: this.publicUrl(key),
      provider: this.provider,
      size: body.byteLength,
      mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    // `locate` has already confirmed the path is inside a directory this
    // application owns, so nothing outside the upload root can be unlinked.
    const target = await this.locate(key);
    if (!target) return;
    try {
      await fs.unlink(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.locate(key)) !== null;
  }

  /**
   * Moves a stored file to a new key.
   *
   * A file still in the legacy directory is moved into the upload root on the
   * way, so renaming an old item also brings it onto the persistent volume.
   * `rename` is tried first and falls back to copy-then-unlink, because the two
   * directories can be different mounts and `rename` cannot cross those.
   */
  async move(fromKey: string, toKey: string): Promise<void> {
    const source = await this.locate(fromKey);
    if (!source) throw new Error('That file is no longer on disk.');
    const target = this.absolute(toKey);
    if (source === target) return;

    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fs.copyFile(source, target);
      await fs.unlink(source);
    }
  }

  /**
   * The public URL of a key.
   *
   * A route prefix, never a filesystem path: where the bytes sit is not the
   * visitor's business, and `/data/uploads` in a page's HTML would be both an
   * information leak and a URL that breaks the moment the volume moves.
   */
  publicUrl(key: string): string {
    return `${mediaPublicPath()}/${key}`.replace(/([^:]\/)\/+/g, '$1');
  }

  /**
   * Is the upload directory there, and can this process write to it?
   *
   * Creates it when it is missing — a fresh volume is mounted empty, and an
   * install that refuses to start because a directory does not exist yet is
   * just a worse error message.
   */
  async health(): Promise<StorageHealth> {
    const location = this.root();
    let exists = false;

    try {
      await fs.mkdir(location, { recursive: true });
      exists = true;
    } catch (error) {
      return {
        driver: this.provider,
        location,
        exists: false,
        writable: false,
        reason: describe(error),
      };
    }

    try {
      await fs.access(location, (await import('node:fs')).constants.W_OK);
      return { driver: this.provider, location, exists, writable: true };
    } catch (error) {
      return {
        driver: this.provider,
        location,
        exists,
        writable: false,
        reason: describe(error),
      };
    }
  }
}

/** An error's code or name — never a path or a credential. */
function describe(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code) return code;
  return error instanceof Error ? error.name : 'unknown';
}
