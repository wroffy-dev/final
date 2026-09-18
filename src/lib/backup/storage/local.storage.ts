import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { assertSafeStorageKey, type BackupStorageProvider } from './storage.interface';

/**
 * Archives on the local filesystem.
 *
 * The directory must be a mounted volume in production. On Coolify the
 * container filesystem is replaced on every redeploy, so an unmounted path
 * silently loses every backup the moment the app is redeployed — the admin UI
 * warns about exactly this.
 */
export class LocalBackupStorage implements BackupStorageProvider {
  readonly kind = 'LOCAL' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /**
   * Resolves a key inside the backup root.
   *
   * The resolved path is re-checked against the root afterwards, so even a key
   * that slipped past validation cannot write elsewhere on disk.
   */
  private resolve(key: string): string {
    assertSafeStorageKey(key);
    const full = path.resolve(this.root, key);
    const prefix = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    if (full !== this.root && !full.startsWith(prefix)) {
      throw new Error('That backup storage key is not valid.');
    }
    return full;
  }

  private async ensureRoot(): Promise<void> {
    await fsp.mkdir(this.root, { recursive: true });
  }

  async upload(key: string, body: Readable): Promise<{ size: number }> {
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });

    // Written to a temporary name and renamed on success, so a crash never
    // leaves a half-written archive that looks complete.
    const temp = `${full}.part`;
    try {
      await pipeline(body, fs.createWriteStream(temp));
      await fsp.rename(temp, full);
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }

    const stat = await fsp.stat(full);
    return { size: stat.size };
  }

  async download(key: string): Promise<Readable> {
    const full = this.resolve(key);
    await fsp.access(full, fs.constants.R_OK);
    return fs.createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.resolve(key), fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Local files have no signable origin; callers use the authenticated route. */
  async getSignedDownloadUrl(): Promise<string | null> {
    return null;
  }

  async list(prefix = ''): Promise<Array<{ key: string; size: number; modifiedAt: Date }>> {
    await this.ensureRoot();
    const out: Array<{ key: string; size: number; modifiedAt: Date }> = [];

    const walk = async (dir: string, base: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const key = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), key);
          continue;
        }
        if (entry.name.endsWith('.part')) continue; // an upload still in flight
        if (prefix && !key.startsWith(prefix)) continue;
        const stat = await fsp.stat(path.join(dir, entry.name)).catch(() => null);
        if (stat) out.push({ key, size: stat.size, modifiedAt: stat.mtime });
      }
    };

    await walk(this.root, '');
    return out.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  }

  async healthCheck(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.ensureRoot();
      // Prove the directory is genuinely writable rather than merely present —
      // a read-only mount is the failure this is meant to catch.
      const probe = path.join(this.root, `.write-probe-${Date.now()}`);
      await fsp.writeFile(probe, 'ok');
      await fsp.rm(probe, { force: true });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'The backup directory is not writable.',
      };
    }
  }

  /** Free space on the backup volume, for the storage warning in the UI. */
  async diskSpace(): Promise<{ freeBytes: number; totalBytes: number } | null> {
    try {
      await this.ensureRoot();
      const stat = await fsp.statfs(this.root);
      return { freeBytes: stat.bavail * stat.bsize, totalBytes: stat.blocks * stat.bsize };
    } catch {
      return null;
    }
  }
}
