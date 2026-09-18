import 'server-only';

/**
 * Backup system configuration, read from the environment once.
 *
 * Every value has a safe default so a deployment that sets nothing still gets
 * working local backups. Nothing here is ever sent to the browser: the admin
 * UI receives a redacted summary from `describeBackupConfig()` instead.
 */

export type BackupStorageDriver = 'local' | 's3';

/** Default when BACKUP_LOCAL_PATH is unset. Must be a mounted volume in production. */
const DEFAULT_LOCAL_PATH = '/app/backups';

export type BackupConfig = {
  driver: BackupStorageDriver;
  localPath: string;
  s3: {
    endpoint: string | null;
    region: string;
    bucket: string | null;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    /** Path-style addressing, required by MinIO and most R2-compatible setups. */
    forcePathStyle: boolean;
  };
  retention: { daily: number; weekly: number; monthly: number };
  /** Present only when archive encryption is configured. */
  encryptionKey: string | null;
  /** Largest archive accepted by the import endpoint, in bytes. */
  maxImportBytes: number;
};

function intFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

export function backupConfig(): BackupConfig {
  const driver: BackupStorageDriver =
    (process.env.BACKUP_STORAGE_DRIVER || 'local').toLowerCase() === 's3' ? 's3' : 'local';

  return {
    driver,
    localPath: process.env.BACKUP_LOCAL_PATH || DEFAULT_LOCAL_PATH,
    s3: {
      endpoint: process.env.BACKUP_S3_ENDPOINT || null,
      region: process.env.BACKUP_S3_REGION || 'auto',
      bucket: process.env.BACKUP_S3_BUCKET || null,
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID || null,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || null,
      forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE !== 'false',
    },
    retention: {
      daily: intFromEnv('BACKUP_RETENTION_DAILY', 7),
      weekly: intFromEnv('BACKUP_RETENTION_WEEKLY', 4),
      monthly: intFromEnv('BACKUP_RETENTION_MONTHLY', 3),
    },
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || null,
    // 2 GB unless overridden; keeps a hostile upload from filling the volume.
    maxImportBytes: intFromEnv('BACKUP_MAX_IMPORT_MB', 2048) * 1024 * 1024,
  };
}

/**
 * What the admin UI is allowed to know about the configuration.
 *
 * Deliberately omits the access key, the secret and the encryption key — the
 * screen only needs to say whether storage is usable, never what it is
 * authenticated with.
 */
export type BackupConfigSummary = {
  driver: BackupStorageDriver;
  localPath: string;
  bucket: string | null;
  endpoint: string | null;
  region: string;
  /** True when the driver has everything it needs to run. */
  configured: boolean;
  retention: { daily: number; weekly: number; monthly: number };
  encryptionConfigured: boolean;
  maxImportBytes: number;
};

export function describeBackupConfig(): BackupConfigSummary {
  const config = backupConfig();
  const configured =
    config.driver === 'local'
      ? Boolean(config.localPath)
      : Boolean(config.s3.bucket && config.s3.accessKeyId && config.s3.secretAccessKey);

  return {
    driver: config.driver,
    localPath: config.localPath,
    bucket: config.s3.bucket,
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    configured,
    retention: config.retention,
    encryptionConfigured: Boolean(config.encryptionKey),
    maxImportBytes: config.maxImportBytes,
  };
}

/**
 * Strips anything secret out of a message before it reaches a log, an audit
 * row or the admin UI.
 *
 * pg_dump and pg_restore echo the connection string in several of their error
 * messages, and an S3 client can include a key in a signature error, so every
 * error that leaves this subsystem passes through here.
 */
export function sanitiseError(input: unknown): string {
  let message =
    input instanceof Error ? input.message : typeof input === 'string' ? input : String(input);

  // Any URI with credentials, whatever the scheme.
  message = message.replace(/([a-z+]+:\/\/)[^\s@/]*:[^\s@/]*@/gi, '$1***:***@');

  const secrets = [
    process.env.DATABASE_URL,
    process.env.DIRECT_DATABASE_URL,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.ENCRYPTION_KEY,
    process.env.BACKUP_ENCRYPTION_KEY,
    process.env.BACKUP_S3_SECRET_ACCESS_KEY,
    process.env.BACKUP_S3_ACCESS_KEY_ID,
    process.env.S3_SECRET_KEY,
    process.env.S3_ACCESS_KEY,
    process.env.CRON_SECRET,
    process.env.SMTP_PASSWORD,
  ].filter((value): value is string => Boolean(value && value.length >= 8));

  for (const secret of secrets) {
    message = message.split(secret).join('***');
  }

  // Belt and braces: a bare postgres URI that survived the pattern above.
  message = message.replace(/postgres(ql)?:\/\/\S+/gi, 'postgresql://***');

  return message.slice(0, 2000);
}
