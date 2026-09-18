import 'server-only';
import { backupConfig } from '../config';
import { LocalBackupStorage } from './local.storage';
import { S3BackupStorage } from './s3.storage';
import type { BackupStorageProvider } from './storage.interface';

export type { BackupStorageProvider } from './storage.interface';
export { assertSafeStorageKey } from './storage.interface';
export { LocalBackupStorage } from './local.storage';
export { S3BackupStorage } from './s3.storage';

let instance: BackupStorageProvider | null = null;

/**
 * The configured backup storage provider.
 *
 * Cached because constructing an S3 client is not free, and reset by
 * `__resetBackupStorage()` in tests.
 */
export function backupStorage(): BackupStorageProvider {
  if (instance) return instance;
  const config = backupConfig();
  instance = config.driver === 's3' ? new S3BackupStorage(config) : new LocalBackupStorage(config.localPath);
  return instance;
}

/** Which enum value belongs on a Backup row for the current driver. */
export function currentStorageKind(): 'LOCAL' | 'S3' {
  return backupConfig().driver === 's3' ? 'S3' : 'LOCAL';
}

export function __resetBackupStorage(): void {
  instance = null;
}
