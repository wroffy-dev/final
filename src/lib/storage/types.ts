export type StorageProvider = 'local' | 's3' | 'r2';

export type StoredFile = {
  key: string;
  url: string;
  provider: StorageProvider;
  size: number;
  mimeType: string;
};

/**
 * What the boot check and the health endpoint need.
 *
 * `location` is for container logs only. It is a filesystem path, so it is
 * never put in a response served to a visitor.
 */
export type StorageHealth = {
  driver: StorageProvider;
  location: string;
  exists: boolean;
  writable: boolean;
  /** Why it is not usable. A message, never a credential. */
  reason?: string;
};

/**
 * The one surface the application has on storage.
 *
 * No caller branches on the provider: an upload, a delete and a rename read
 * exactly the same whether the bytes land on a mounted disk or in a bucket,
 * which is what lets a deployment change `STORAGE_DRIVER` without any of this
 * code being touched.
 */
export interface StorageService {
  readonly provider: StorageProvider;
  put(input: { key: string; body: Buffer; mimeType: string }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Moves a stored object to a new key. Used when a media item is renamed. */
  move(fromKey: string, toKey: string): Promise<void>;
  publicUrl(key: string): string;
  health(): Promise<StorageHealth>;
}
