import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Readiness.
 *
 * Distinct from liveness in what it is *for*: Azure Container Apps must not
 * route traffic to a replica that has a database connection but has not yet had
 * its migrations applied, because such a replica answers requests with schema
 * errors. So this asks a second question — does the schema this build expects
 * actually exist?
 *
 * It is answered by reading one row's existence from the migrations table, which
 * is a primary-key lookup on a table with a handful of rows. Cheap enough to
 * poll every few seconds, and it fails for exactly the case a plain `SELECT 1`
 * would pass: a fresh database behind an app that needs `migrate deploy`.
 */
export async function GET() {
  try {
    const rows = await prisma.$queryRaw<Array<{ applied: bigint }>>`
      SELECT COUNT(*)::bigint AS applied
        FROM "_prisma_migrations"
       WHERE "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL
    `;

    const applied = Number(rows[0]?.applied ?? 0);

    if (applied === 0) {
      return NextResponse.json(
        { status: 'not-ready', reason: 'migrations-pending' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { status: 'ready', timestamp: new Date().toISOString(), migrationsApplied: applied },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    // A missing `_prisma_migrations` table lands here too, which is the correct
    // answer for a database that has never been migrated.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'ready.check_failed',
        error: error instanceof Error ? error.name : 'unknown',
      }),
    );

    return NextResponse.json(
      { status: 'not-ready', reason: 'database-unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
