-- Backup & restore system.
--
-- Entirely additive: three new tables and four new enums. No existing table,
-- column or row is touched, so this is safe to deploy against production.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE "BackupType" AS ENUM ('FULL', 'DATABASE', 'MEDIA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DELETING', 'RESTORING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BackupStorage" AS ENUM ('LOCAL', 'S3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BackupOrigin" AS ENUM ('MANUAL', 'SCHEDULED', 'SAFETY', 'IMPORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Backup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Backup" (
    "id"               TEXT NOT NULL,
    "type"             "BackupType" NOT NULL,
    "status"           "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "storage"          "BackupStorage" NOT NULL,
    "origin"           "BackupOrigin" NOT NULL DEFAULT 'MANUAL',
    "fileName"         TEXT,
    "storageKey"       TEXT,
    -- Archives can exceed 2 GB, which overflows a 32-bit integer.
    "sizeBytes"        BIGINT,
    "checksum"         TEXT,
    "manifestVersion"  INTEGER,
    "appVersion"       TEXT,
    "mediaIncluded"    BOOLEAN NOT NULL DEFAULT false,
    "databaseIncluded" BOOLEAN NOT NULL DEFAULT false,
    "startedAt"        TIMESTAMP(3),
    "completedAt"      TIMESTAMP(3),
    "failedAt"         TIMESTAMP(3),
    "errorMessage"     TEXT,
    "createdById"      TEXT,
    "automatic"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Backup_createdAt_idx" ON "Backup"("createdAt");
CREATE INDEX IF NOT EXISTS "Backup_status_idx" ON "Backup"("status");
CREATE INDEX IF NOT EXISTS "Backup_type_status_idx" ON "Backup"("type", "status");
CREATE INDEX IF NOT EXISTS "Backup_origin_idx" ON "Backup"("origin");

-- Deleting a staff account must not delete the backups they created.
ALTER TABLE "Backup" DROP CONSTRAINT IF EXISTS "Backup_createdById_fkey";
ALTER TABLE "Backup"
    ADD CONSTRAINT "Backup_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BackupRestore
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BackupRestore" (
    "id"             TEXT NOT NULL,
    "backupId"       TEXT NOT NULL,
    "status"         "BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "safetyBackupId" TEXT,
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"    TIMESTAMP(3),
    "failedAt"       TIMESTAMP(3),
    "errorMessage"   TEXT,
    "restoredById"   TEXT,
    CONSTRAINT "BackupRestore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BackupRestore_backupId_idx" ON "BackupRestore"("backupId");
CREATE INDEX IF NOT EXISTS "BackupRestore_startedAt_idx" ON "BackupRestore"("startedAt");

ALTER TABLE "BackupRestore" DROP CONSTRAINT IF EXISTS "BackupRestore_backupId_fkey";
ALTER TABLE "BackupRestore"
    ADD CONSTRAINT "BackupRestore_backupId_fkey"
    FOREIGN KEY ("backupId") REFERENCES "Backup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BackupSchedule (singleton, like the other settings rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BackupSchedule" (
    "id"               TEXT NOT NULL DEFAULT 'singleton',
    "enabled"          BOOLEAN NOT NULL DEFAULT false,
    "frequency"        TEXT NOT NULL DEFAULT 'daily',
    "hour"             INTEGER NOT NULL DEFAULT 3,
    "minute"           INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek"        INTEGER NOT NULL DEFAULT 0,
    "dayOfMonth"       INTEGER NOT NULL DEFAULT 1,
    "backupType"       "BackupType" NOT NULL DEFAULT 'FULL',
    "timezone"         TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "retentionDaily"   INTEGER NOT NULL DEFAULT 7,
    "retentionWeekly"  INTEGER NOT NULL DEFAULT 4,
    "retentionMonthly" INTEGER NOT NULL DEFAULT 3,
    "lastRunAt"        TIMESTAMP(3),
    "nextRunAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackupSchedule_pkey" PRIMARY KEY ("id")
);
