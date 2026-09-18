-- A single-row lock table for backup/restore mutual exclusion.
--
-- A PostgreSQL advisory lock alone is not sufficient here: advisory locks are
-- re-entrant within a session, and Prisma pools connections, so two sequential
-- acquisitions can land on the same connection and both succeed. This table
-- gives an unambiguous, cross-connection claim, and `acquiredAt` lets a claim
-- left behind by a killed container expire instead of blocking forever.
CREATE TABLE IF NOT EXISTS "BackupLock" (
    "id"         TEXT NOT NULL DEFAULT 'singleton',
    "operation"  TEXT NOT NULL,
    "holder"     TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackupLock_pkey" PRIMARY KEY ("id")
);
