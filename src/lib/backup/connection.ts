import 'server-only';

/**
 * Turns Prisma's DATABASE_URL into one libpq accepts.
 *
 * Prisma's connection string carries parameters that are meaningful only to
 * Prisma — `schema`, `connection_limit`, `pgbouncer` and friends. libpq rejects
 * an unknown query parameter outright, so `pg_dump` given a stock Prisma URL
 * fails immediately with `invalid URI query parameter: "schema"`. Almost every
 * Prisma deployment has `?schema=public` in that variable, so this translation
 * is not an edge case — without it the backup system would never work in
 * production.
 *
 * Parameters libpq does understand are passed through untouched, and a
 * non-default `schema` is preserved by setting the search path instead.
 */

/**
 * Query parameters libpq accepts on a connection URI.
 *
 * Taken from the libpq connection-parameter list. `host` matters especially:
 * it is the only way to point a URI at a Unix socket while still naming a
 * port, and dropping it silently sends the tools to TCP localhost instead.
 */
const LIBPQ_PARAMS = new Set([
  'application_name',
  'channel_binding',
  'client_encoding',
  'connect_timeout',
  'dbname',
  'fallback_application_name',
  'gssencmode',
  'gsslib',
  'host',
  'hostaddr',
  'keepalives',
  'keepalives_count',
  'keepalives_idle',
  'keepalives_interval',
  'krbsrvname',
  'load_balance_hosts',
  'options',
  'passfile',
  'password',
  'port',
  'replication',
  'require_auth',
  'requirepeer',
  'service',
  'sslcert',
  'sslcompression',
  'sslcrl',
  'sslcrldir',
  'sslkey',
  'sslmode',
  'sslnegotiation',
  'sslpassword',
  'sslrootcert',
  'sslsni',
  'target_session_attrs',
  'tcp_user_timeout',
  'user',
]);

export type PostgresConnection = {
  /** A URI safe to hand to pg_dump or pg_restore. */
  url: string;
  /** Extra environment for the child process (search_path, when needed). */
  env: Record<string, string>;
  /** The schema Prisma was pointed at, when it named one. */
  schema: string | null;
};

export function postgresConnection(rawUrl = process.env.DATABASE_URL): PostgresConnection {
  if (!rawUrl) throw new Error('DATABASE_URL is not configured.');

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string.');
  }

  const schema = parsed.searchParams.get('schema');

  // Drop everything libpq would refuse.
  for (const key of [...parsed.searchParams.keys()]) {
    if (!LIBPQ_PARAMS.has(key)) parsed.searchParams.delete(key);
  }

  const env: Record<string, string> = {};
  if (schema && schema !== 'public') {
    // Keeps a non-default schema reachable without adding a rejected parameter.
    env.PGOPTIONS = `-c search_path=${schema}`;
  }

  return { url: parsed.toString(), env, schema: schema ?? null };
}
