import 'server-only';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import { sanitiseError } from './config';
import { postgresConnection } from './connection';

/**
 * PostgreSQL dump and restore via the official client tools.
 *
 * A Prisma JSON export is not used as the production format: it loses
 * sequences, constraint ordering, extensions and exact types, and restoring it
 * means replaying writes through the ORM. `pg_dump -Fc` captures the real
 * database and `pg_restore` puts it back, which is what a disaster recovery
 * plan actually needs.
 *
 * Every invocation uses `spawn` with an argument array. Nothing is ever
 * interpolated into a shell string, so a database name or password containing
 * shell metacharacters cannot become a command.
 */

/** Environment for a client tool, including any search path Prisma implied. */
function toolEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, PGCONNECT_TIMEOUT: '30', ...extra };
}

export type ProcessResult = { code: number | null; stderr: string };

/**
 * Runs a postgres client tool.
 *
 * stderr is captured rather than inherited so it can be sanitised before it
 * ever reaches a log or the admin UI — pg_dump prints the connection string in
 * several of its error messages.
 */
function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Bounded, so a tool that loops printing errors cannot exhaust memory.
      if (stderr.length < 64_000) stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            `${command} is not installed in this container. Add the PostgreSQL client utilities to the image.`,
          ),
        );
        return;
      }
      reject(new Error(sanitiseError(error)));
    });

    child.on('close', (code) => resolve({ code, stderr: sanitiseError(stderr) }));
  });
}

/** Whether pg_dump and pg_restore are available, for the settings screen. */
export async function databaseToolsAvailable(): Promise<{
  available: boolean;
  pgDump: boolean;
  pgRestore: boolean;
}> {
  const check = async (command: string) => {
    try {
      const result = await run(command, ['--version'], process.env);
      return result.code === 0;
    } catch {
      return false;
    }
  };

  const [pgDump, pgRestore] = await Promise.all([check('pg_dump'), check('pg_restore')]);
  return { available: pgDump && pgRestore, pgDump, pgRestore };
}

/**
 * Writes a `pg_dump -Fc` archive to `outputPath`.
 *
 * Custom format rather than plain SQL: it is compressed, restores selectively
 * and lets pg_restore reorder objects to satisfy dependencies.
 */
export async function dumpDatabase(outputPath: string): Promise<void> {
  const connection = postgresConnection();

  const result = await run(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner', // the restoring role may differ from the dumping one
      '--no-privileges',
      '--no-acl',
      '--file',
      outputPath,
      '--dbname',
      connection.url,
    ],
    toolEnv(connection.env),
  );

  if (result.code !== 0) {
    await fsp.rm(outputPath, { force: true }).catch(() => undefined);
    throw new Error(result.stderr || 'The database dump failed.');
  }

  const stat = await fsp.stat(outputPath).catch(() => null);
  if (!stat || stat.size === 0) {
    throw new Error('The database dump produced an empty file.');
  }
}

/**
 * Restores a `pg_dump -Fc` archive over the current database.
 *
 * `--clean --if-exists` drops each object before recreating it, so the restore
 * replaces rather than merges. `--single-transaction` makes the whole thing
 * atomic: a failure part-way leaves the database exactly as it was instead of
 * half-replaced, which is the difference between a failed restore and a
 * destroyed site.
 */
export async function restoreDatabase(dumpPath: string): Promise<void> {
  const connection = postgresConnection();

  await fsp.access(dumpPath).catch(() => {
    throw new Error('The database dump is missing from that archive.');
  });

  const result = await run(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      '--dbname',
      connection.url,
      dumpPath,
    ],
    toolEnv(connection.env),
  );

  if (result.code !== 0) {
    throw new Error(result.stderr || 'The database restore failed.');
  }
}

/**
 * Verifies an archive is a readable pg_dump custom archive before a restore
 * touches the live database. `--list` reads the table of contents only.
 */
export async function verifyDumpArchive(dumpPath: string): Promise<boolean> {
  try {
    const result = await run('pg_restore', ['--list', dumpPath], process.env);
    return result.code === 0;
  } catch {
    return false;
  }
}
