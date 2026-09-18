import 'server-only';
import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertSafeStorageKey, type BackupStorageProvider } from './storage.interface';
import type { BackupConfig } from '../config';

/**
 * Archives in any S3-compatible bucket — AWS S3, Cloudflare R2, MinIO.
 *
 * Objects are written private: no ACL is set, so they inherit the bucket's
 * default, and downloads go through a short-lived signed URL rather than a
 * public path. The bucket must not be configured for public read.
 */
export class S3BackupStorage implements BackupStorageProvider {
  readonly kind = 'S3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: BackupConfig) {
    const { bucket, accessKeyId, secretAccessKey, region, endpoint, forcePathStyle } = config.s3;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 backup storage needs BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY.',
      );
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint: endpoint ?? undefined,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async upload(key: string, body: Readable): Promise<{ size: number }> {
    assertSafeStorageKey(key);

    // Multipart upload, so an archive larger than memory streams through in
    // parts rather than being buffered.
    let size = 0;
    body.on('data', (chunk: Buffer) => {
      size += chunk.length;
    });

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/zip',
      },
      queueSize: 3,
      partSize: 8 * 1024 * 1024,
    });

    await upload.done();
    return { size };
  }

  async download(key: string): Promise<Readable> {
    assertSafeStorageKey(key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error('That backup is not available in storage.');
    return result.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    assertSafeStorageKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async list(prefix = ''): Promise<Array<{ key: string; size: number; modifiedAt: Date }>> {
    const out: Array<{ key: string; size: number; modifiedAt: Date }> = [];
    let token: string | undefined;

    // Paginated, so a bucket with more than 1000 archives still lists fully.
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix || undefined,
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        out.push({
          key: object.Key,
          size: object.Size ?? 0,
          modifiedAt: object.LastModified ?? new Date(0),
        });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return out.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  }

  async healthCheck(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      // A one-key list proves credentials, endpoint and bucket all work
      // without writing anything.
      await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.name : 'Could not reach the bucket.',
      };
    }
  }
}
