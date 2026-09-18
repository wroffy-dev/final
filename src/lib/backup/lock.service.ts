import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

/**
 * Mutual exclusion for backup and restore.
 *
 * Two mechanisms, because neither is sufficient alone:
 *
 * A PostgreSQL advisory lock is re-entrant *within a session*. Prisma pools
 * connections, so two sequential acquisitions can land on the same connection
 * and both succeed — which is exactly the collision this is meant to prevent.
 *
 * A lock row alone would leak on a crash: the container dies, the row stays,
 * and every later attempt is blocked until someone clears it by hand.
 *
 * So: a transaction-scoped advisory lock makes the claim atomic against
 * concurrent writers, and the row it guards carries an expiry so a claim left
 * behind by a killed process lapses on its own.
 *
 * One lock covers both operations deliberately — two simultaneous restores
 * would corrupt the database, and a backup taken mid-restore would capture a
 * half-restored state.
 */

/** Arbitrary but fixed. No other advisory lock in this app may reuse it. */
const ADVISORY_KEY = 728_451_903;

/**
 * How long a claim survives without its holder finishing.
 *
 * Long enough that a genuinely slow backup of a large site is never evicted
 * mid-run, short enough that a crashed container does not block backups for a
 * working day.
 */
const LOCK_TTL_MS = 6 * 60 * 60 * 1000;

export type BackupOperation = 'BACKUP' | 'RESTORE';

export class BackupBusyError extends Error {
  constructor(
    message = 'Another backup or restore is already running. Try again once it finishes.',
  ) {
    super(message);
    this.name = 'BackupBusyError';
  }
}

/**
 * Claims the lock, or returns null when someone else holds a live claim.
 *
 * The whole check-and-write happens inside one transaction holding a
 * transaction-scoped advisory lock, so two callers racing cannot both observe
 * "free" and both write.
 */
async function acquire(operation: BackupOperation, holder: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Serialises the claim against any other acquirer; released with the
    // transaction, whatever happens. $executeRaw rather than $queryRaw because
    // the function returns void, which has no Prisma column type.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_KEY}::bigint)`;

    const existing = await tx.backupLock.findUnique({ where: { id: 'singleton' } });
    const now = new Date();

    if (existing && existing.expiresAt > now) return false;

    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    await tx.backupLock.upsert({
      where: { id: 'singleton' },
      update: { operation, holder, acquiredAt: now, expiresAt },
      create: { id: 'singleton', operation, holder, acquiredAt: now, expiresAt },
    });

    return true;
  });
}

async function release(holder: string): Promise<void> {
  // Scoped to this holder so a run that overran its TTL — and whose claim has
  // since been taken by someone else — cannot release the new owner's lock.
  await prisma.backupLock
    .deleteMany({ where: { id: 'singleton', holder } })
    .catch(() => undefined);
}

/**
 * Runs `work` while holding the lock, or throws BackupBusyError immediately.
 *
 * Never queues: a restore that silently started an hour after the admin asked
 * for it would be worse than a refusal they can act on.
 */
export async function withBackupLock<T>(
  work: () => Promise<T>,
  operation: BackupOperation = 'BACKUP',
): Promise<T> {
  const holder = crypto.randomUUID();

  let acquired = false;
  try {
    acquired = await acquire(operation, holder);
  } catch (error) {
    // A missing table means the migration has not been applied yet; say so
    // plainly rather than failing with a Prisma error code.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      throw new Error('The backup system is not migrated yet. Run prisma migrate deploy.');
    }
    throw error;
  }

  if (!acquired) throw new BackupBusyError();

  try {
    return await work();
  } finally {
    await release(holder);
  }
}

/** Whether a backup or restore is in progress right now, for the UI. */
export async function isBackupLocked(): Promise<boolean> {
  const lock = await prisma.backupLock
    .findUnique({ where: { id: 'singleton' } })
    .catch(() => null);
  return Boolean(lock && lock.expiresAt > new Date());
}

/** Frees a stale claim. Exposed so an admin is never permanently stuck. */
export async function clearStaleLock(): Promise<boolean> {
  const result = await prisma.backupLock.deleteMany({
    where: { id: 'singleton', expiresAt: { lte: new Date() } },
  });
  return result.count > 0;
}
