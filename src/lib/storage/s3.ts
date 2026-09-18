import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageHealth, StorageService, StoredFile } from './types';

/**
 * S3-compatible storage. Works unchanged against AWS S3, Cloudflare R2,
 * MinIO, Backblaze B2 and DigitalOcean Spaces.
 */
export class S3Storage implements StorageService {
  readonly provider: 's3' | 'r2';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(provider: 's3' | 'r2' = 's3') {
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required for S3/R2 storage');
    }
    this.provider = provider;
    this.bucket = bucket;
    this.publicBase = (process.env.S3_PUBLIC_URL || '').replace(/\/+$/, '');
    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put({ key, body, mimeType }: { key: string; body: Buffer; mimeType: string }): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: this.publicUrl(key), provider: this.provider, size: body.byteLength, mimeType };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      // Head fails for a missing object and for a denied one alike, and the
      // caller wants the same answer either way: it is not readable from here.
      return false;
    }
  }

  /**
   * Copy, then delete. S3 has no rename, and doing it in this order means a
   * failure leaves the original in place rather than losing the object.
   */
  async move(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${fromKey}`,
        Key: toKey,
        MetadataDirective: 'COPY',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    await this.delete(fromKey);
  }

  /**
   * Configuration only, with no round trip to the bucket.
   *
   * This is read by the container health check, which is polled every thirty
   * seconds — a HeadBucket on each of those would bill and rate-limit for no
   * new information, since a bucket that has gone away announces itself on the
   * first upload anyway. The constructor already refused to build without
   * credentials, so reaching here means the driver is configured.
   */
  async health(): Promise<StorageHealth> {
    return {
      driver: this.provider,
      // The bucket name, not a path, and not a credential.
      location: this.bucket,
      exists: true,
      writable: true,
    };
  }

  publicUrl(key: string): string {
    if (this.publicBase) return `${this.publicBase}/${key}`;
    const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
    if (endpoint) return `${endpoint}/${this.bucket}/${key}`;
    return `https://${this.bucket}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
  }
}
