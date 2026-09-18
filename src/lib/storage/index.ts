import 'server-only';
import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { StorageProvider, StorageService } from './types';

export type { StorageService, StoredFile, StorageHealth, StorageProvider } from './types';
export {
  uploadRoot,
  legacyUploadRoots,
  mediaPublicPath,
  safeStorageKey,
  resolveWithin,
  DEFAULT_UPLOAD_DIR,
  LEGACY_MEDIA_PUBLIC_PATH,
} from './paths';

let instance: StorageService | null = null;

/**
 * The configured driver.
 *
 * `STORAGE_DRIVER` is the name to use; `STORAGE_PROVIDER` is read after it so
 * a deployment configured before the rename keeps working. Anything
 * unrecognised is local, because the failure mode of guessing wrong here is a
 * container that will not start over a typo — and local is the driver that
 * needs no account anywhere.
 */
export function storageDriver(): StorageProvider {
  const configured = (process.env.STORAGE_DRIVER || process.env.STORAGE_PROVIDER || 'local')
    .trim()
    .toLowerCase();
  if (configured === 's3') return 's3';
  if (configured === 'r2') return 'r2';
  return 'local';
}

/** Resolves the configured storage driver. CMS code never branches on provider. */
export function storage(): StorageService {
  if (instance) return instance;
  const driver = storageDriver();
  instance = driver === 'local' ? new LocalStorage() : new S3Storage(driver);
  reportOnce(instance);
  return instance;
}

let reported = false;

/**
 * One line, the first time storage is used in this process.
 *
 * The failure it exists to catch is a container started without its volume:
 * everything works, nobody notices, and uploads land on a layer the next
 * deployment throws away. It is logged from here rather than from
 * `instrumentation.ts` because that file is compiled for the Edge runtime
 * alongside middleware, and nothing reachable from it may import `node:fs`.
 *
 * Deliberately not fatal, and deliberately not awaited: an unwritable upload
 * directory stops uploads, it does not stop the site serving pages, and
 * refusing to answer a request over it would take a working storefront down.
 */
function reportOnce(service: StorageService): void {
  if (reported) return;
  reported = true;

  void service
    .health()
    .then((health) => {
      console.log(
        JSON.stringify({
          level: health.writable ? 'info' : 'error',
          event: 'storage.check',
          time: new Date().toISOString(),
          driver: health.driver,
          // A directory, or a bucket name. Neither is a secret, and a missing
          // mount cannot be diagnosed without seeing which path was checked.
          // This goes to container logs and never into a response.
          location: health.location,
          exists: health.exists,
          writable: health.writable,
          ...(health.reason ? { reason: health.reason } : {}),
        }),
      );

      if (!health.writable) {
        console.error(
          '[storage] Uploads will fail: the storage location is not writable. For the ' +
            'local driver, mount a persistent volume at UPLOAD_DIR and make it writable ' +
            'by the container user. See docs/MEDIA-STORAGE.md.',
        );
      }
    })
    .catch((error: unknown) => {
      console.error(
        `[storage] check failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    });
}

/** Test/reset hook. */
export function __resetStorage() {
  instance = null;
}
