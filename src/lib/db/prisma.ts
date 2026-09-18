import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * The single Prisma client for the process.
 *
 * Cached on `globalThis` in every environment, not just development. In dev it
 * stops hot reload leaking a new pool on every edit; in production it protects
 * against the same module being instantiated twice through different bundles
 * (route handlers, server actions and instrumentation are separately traced),
 * which on a small Azure PostgreSQL tier is a real risk: a Basic B1ms server
 * allows ~35 connections in total, and Prisma's default pool is
 * `num_cpus * 2 + 1` *per client*. Three replicas each holding two pools would
 * exhaust the server on its own.
 *
 * The pool size itself is set through the connection string rather than in
 * code — `?connection_limit=5` — so it can be tuned per environment without a
 * rebuild. See docs/AZURE-DEPLOYMENT.md.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaShutdownBound?: boolean;
};

function createClient(): PrismaClient {
  return new PrismaClient({
    // `error` only in production: Prisma's `query` and `info` channels echo
    // parameters, and `warn` includes the connection string on pool timeouts.
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;

/**
 * Graceful shutdown — handled by Next.js, deliberately not re-implemented here.
 *
 * Azure Container Apps sends SIGTERM when it replaces a revision or scales in.
 * Next.js's standalone server already registers SIGTERM and SIGINT handlers that
 * stop accepting connections, wait for in-flight requests to finish, close the
 * HTTP server and then exit — which is the part that matters for a clean
 * rollover.
 *
 * An application-level handler was written here and removed after testing: it
 * never ran. Next registers its handler first and its cleanup calls
 * `process.exit(0)`, so a second handler added by a route module has no
 * observable effect. Making one work would mean setting `NEXT_MANUAL_SIG_HANDLE`
 * and taking over closing the HTTP server as well — a custom process manager,
 * for no real gain: Prisma's sockets are closed by the kernel when the process
 * exits and PostgreSQL reaps those backends immediately, so connections are not
 * leaked either way.
 *
 * What genuinely protects the database through a rollover is bounding the pool,
 * via `connection_limit` in DATABASE_URL as described above.
 */
