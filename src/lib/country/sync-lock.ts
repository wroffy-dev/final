import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

/**
 * Claiming the right to sync into one market.
 *
 * ## Why an advisory lock and not just a query
 *
 * The obvious guard — look for a RUNNING run, and create one if there is none —
 * has a window between the two statements. Two administrators pressing "Sync
 * from India" on the same market within that window both see nothing running
 * and both start. They then race the mapping table, and the second one can read
 * "no mapping" for a page the first has already created but not yet recorded —
 * producing exactly the duplicate the mapping exists to prevent.
 *
 * So the check and the claim happen inside one transaction holding a
 * transaction-scoped advisory lock. Two callers cannot both observe "free".
 *
 * ## Why the key is per market
 *
 * India → UAE and India → Qatar write to different markets and share no
 * destination rows, so making them wait for each other would be a limitation
 * with nothing behind it. The lock is keyed on the **destination**, which is
 * the only thing two runs can contend over.
 *
 * ## Why the row still carries an expiry
 *
 * The advisory lock is released the moment its transaction ends, which is long
 * before the sync itself finishes — it guards the claim, not the work. The
 * RUNNING row is what holds the claim for the duration, and a row left behind
 * by a container that was killed mid-sync lapses on its own rather than
 * blocking the market until somebody clears it by hand.
 */

/** Arbitrary but fixed. No other advisory lock in this app may reuse it. */
const LOCK_NAMESPACE = 611_204_338;

/** A run left behind by a killed container stops blocking after this. */
export const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * A stable 32-bit key for a market id.
 *
 * `pg_advisory_xact_lock(int, int)` wants two 32-bit integers, so the cuid is
 * hashed down to one. A collision between two markets would only ever make one
 * wait briefly for the other's claim to commit, which is why a digest is enough
 * and nothing more elaborate is warranted.
 */
function lockKey(countryId: string): number {
  return crypto.createHash('sha1').update(countryId).digest().readInt32BE(0);
}

export type SyncClaim = { runId: string } | { busy: true };

/**
 * Starts a run into `targetCountryId`, or reports that one is already going.
 *
 * The returned run is already RUNNING: the caller owns it and must finish it,
 * whether that ends COMPLETED or FAILED.
 */
export async function claimSyncRun(input: {
  sourceCountryId: string;
  targetCountryId: string;
  startedById: string;
}): Promise<SyncClaim> {
  const { sourceCountryId, targetCountryId, startedById } = input;

  return prisma.$transaction(async (tx) => {
    /*
     * Serialises this claim against any other claim on the same market;
     * released with the transaction, whatever happens. `$executeRaw` rather
     * than `$queryRaw` because the function returns void, which has no Prisma
     * column type.
     */
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${lockKey(
      targetCountryId,
    )}::int)`;

    const running = await tx.countrySyncRun.findFirst({
      where: {
        targetCountryId,
        status: 'RUNNING',
        startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) },
      },
      select: { id: true },
    });
    if (running) return { busy: true } as const;

    const run = await tx.countrySyncRun.create({
      data: {
        sourceCountryId,
        targetCountryId,
        mode: 'ADD_MISSING',
        status: 'RUNNING',
        startedById,
      },
      select: { id: true },
    });
    return { runId: run.id };
  });
}
