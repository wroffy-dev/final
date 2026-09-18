/**
 * Server startup and shutdown.
 *
 * Next.js calls `register()` once per server process, before the first request
 * is served. Two jobs happen here:
 *
 *  1. Environment validation. A production container with a missing critical
 *     variable exits immediately with a list of what is wrong, instead of
 *     booting and failing confusingly at the first sign-in.
 *  2. One structured startup line, so an operator can confirm which image and
 *     configuration a replica came up with.
 *
 * Graceful shutdown is deliberately *not* here. This file is compiled for the
 * Edge runtime alongside middleware, so anything it imports is paid for on every
 * request — importing Prisma from here doubled the middleware bundle. Signal
 * handling lives in `src/lib/db/prisma.ts`, which owns the connection pool and
 * is `server-only`.
 *
 * Nothing imported here pulls in a dependency: `env-validation` is plain
 * TypeScript with no zod, for the same bundling reason.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertProductionEnv } = await import('@/lib/env-validation');

  try {
    assertProductionEnv();
  } catch (error) {
    // Deliberately fatal. A container that cannot work should fail visibly so
    // the platform surfaces it, rather than serving broken pages.
    console.error(`[startup] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  logStartup();
}

/**
 * One structured line at boot, carrying only what an operator needs to confirm
 * the right image reached the right environment. No connection string, no
 * secret, no key — the database is described by host and name only.
 */
function logStartup(): void {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'app.start',
      time: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT ?? '3000',
      storage: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),
      backupStorage: (process.env.BACKUP_STORAGE_DRIVER || 'local').toLowerCase(),
      database: describeDatabase(),
      migrationsOnBoot: process.env.RUN_MIGRATIONS !== 'false',
    }),
  );
}

/**
 * Host and database name only.
 *
 * Parsed rather than pattern-stripped, so there is no way for a credential to
 * survive into the log through an unusual URL shape. An unparseable value is
 * reported as such rather than echoed.
 */
function describeDatabase(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return 'not configured';
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return 'unparseable';
  }
}
