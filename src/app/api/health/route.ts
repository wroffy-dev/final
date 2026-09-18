import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
/** Never cached, never prerendered — a cached health check is not a health check. */
export const revalidate = 0;

/**
 * Liveness.
 *
 * Answers one question: is this replica able to reach the database and serve a
 * request? It runs `SELECT 1` and nothing else — no counts, no joins — because
 * this endpoint is polled by the Docker HEALTHCHECK, by Azure Container Apps
 * and by any uptime monitor pointed at it, and an expensive probe becomes its
 * own source of load.
 *
 * Nothing about the failure reaches the response. A caller learns that the
 * database is unreachable, never which host, which user, or what the driver
 * said — those details belong in container logs, not in a body served to
 * whoever can reach the URL.
 *
 * Storage is reported alongside it as a driver name and a yes/no, and never as
 * a path: this endpoint is unauthenticated, and `/data/uploads` in a public
 * body tells a stranger about the filesystem for no operational gain. It also
 * does not change the status code — an upload directory that has lost its
 * volume is a real problem, but the site still serves every page it has, and
 * failing the container health check over it would restart a working replica
 * in a loop.
 */
export async function GET() {
  const startedAt = Date.now();
  const media = await storageStatus();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        storage: media,
        latencyMs: Date.now() - startedAt,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    // Name only. A Prisma connection error's message can contain the full
    // connection string, credentials included.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'health.database_unreachable',
        error: error instanceof Error ? error.name : 'unknown',
      }),
    );

    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'unreachable',
        storage: media,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}

/** Driver and writability. Never the location, never a credential. */
async function storageStatus(): Promise<{ driver: string; writable: boolean }> {
  try {
    const health = await storage().health();
    return { driver: health.driver, writable: health.writable };
  } catch {
    return { driver: 'unknown', writable: false };
  }
}
