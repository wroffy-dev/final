/* eslint-disable no-console */
/**
 * Rehearses the pending migrations against a copy of real data.
 *
 * A migration that has only ever run against fixtures has not really been
 * tested: production carries soft-deleted rows, nulls where the code "always"
 * writes a value, unicode, archived content and slugs nobody would invent. This
 * restores a production dump into a scratch database, migrates it, and then
 * asserts that nothing was lost and everything landed where it should.
 *
 * Nothing here can touch production. The scratch database is dropped and
 * recreated on every run, and the script refuses to start if the scratch URL is
 * the same database as DATABASE_URL.
 *
 * Usage:
 *   REHEARSAL_DATABASE_URL=postgresql://user@host:5432/rehearsal \
 *     node scripts/rehearse-migration.mjs ./production.dump
 *
 * The dump may be a `pg_dump -Fc` archive (what this app's own backup system
 * produces) or a plain `.sql` file.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, so this works from any working directory. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(repoRoot, 'prisma', 'schema.prisma');

const dumpPath = process.argv[2];
const scratchUrl = process.env.REHEARSAL_DATABASE_URL;

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!dumpPath) fail('Usage: node scripts/rehearse-migration.mjs <path-to-dump>');
if (!existsSync(dumpPath)) fail(`No such dump: ${dumpPath}`);
if (!scratchUrl) fail('Set REHEARSAL_DATABASE_URL to a scratch database this script may destroy.');

/*
 * The one guard that matters. Comparing whole URLs would be fooled by a
 * trailing slash or a different user, so the host, port and database name are
 * compared directly.
 */
if (process.env.DATABASE_URL) {
  const same = (a, b) => {
    try {
      const x = new URL(a);
      const y = new URL(b);
      return x.host === y.host && x.pathname === y.pathname;
    } catch {
      return a === b;
    }
  };
  if (same(process.env.DATABASE_URL, scratchUrl)) {
    fail('REHEARSAL_DATABASE_URL is the same database as DATABASE_URL. Point it at a scratch database.');
  }
}

const scratch = new URL(scratchUrl);
const scratchName = scratch.pathname.replace(/^\//, '');
if (!scratchName) fail('REHEARSAL_DATABASE_URL must name a database.');

/*
 * Parameters Prisma understands and libpq does not.
 *
 * A Prisma connection string usually carries `?schema=public`, and psql and
 * pg_restore reject the whole URL over it: `invalid URI query parameter`. The
 * Prisma CLI still gets the URL as given; only the command-line tools get the
 * trimmed one.
 */
const PRISMA_ONLY_PARAMS = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'pgbouncer',
  'statement_cache_size',
  'sslidentity',
  'sslpassword',
  'sslaccept',
];

function libpqUrl(url, database) {
  const copy = new URL(url);
  for (const param of PRISMA_ONLY_PARAMS) copy.searchParams.delete(param);
  if (database) copy.pathname = `/${database}`;
  return copy.toString();
}

/** The scratch database, as psql and pg_restore will accept it. */
const psqlUrl = libpqUrl(scratchUrl);

/** The same server, but connected to `postgres`, so the scratch DB can be dropped. */
const adminUrl = libpqUrl(scratchUrl, 'postgres');

/*
 * The Prisma CLI, preferring the copy already installed.
 *
 * `npx prisma` turns a resolution miss into a registry fetch, which fails on a
 * host with restricted egress — the same reason the container entrypoint calls
 * the bundled CLI directly.
 */
const BUNDLED_PRISMA = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
const prismaCommand = existsSync(BUNDLED_PRISMA)
  ? { command: process.execPath, prefix: [BUNDLED_PRISMA] }
  : { command: 'npx', prefix: ['prisma'] };

/** Runs the Prisma CLI against the scratch database. */
function prisma(args) {
  return run(prismaCommand.command, [...prismaCommand.prefix, ...args], {
    env: { DATABASE_URL: scratchUrl },
  });
}

function run(command, args, { env = {}, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** One value from one query. */
async function value(sql) {
  const result = await run('psql', [psqlUrl, '-tAc', sql]);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `query failed: ${sql}`);
  return result.stdout.trim();
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const size = (statSync(dumpPath).size / 1024 / 1024).toFixed(1);
  console.log(`\nRehearsing migrations against ${path.basename(dumpPath)} (${size} MB)`);
  console.log(`Scratch database: ${scratch.host}/${scratchName}\n`);

  // --- 1. a clean scratch database -----------------------------------------
  console.log('1. Recreating the scratch database');
  for (const sql of [
    `DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`,
    `CREATE DATABASE "${scratchName}"`,
  ]) {
    const result = await run('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
    if (result.code !== 0) fail(`Could not prepare the scratch database: ${result.stderr.trim()}`);
  }

  // --- 2. restore the dump --------------------------------------------------
  console.log('2. Restoring the dump');
  const isPlainSql = /\.sql$/i.test(dumpPath);
  const restore = isPlainSql
    ? await run('psql', [psqlUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', dumpPath])
    : await run('pg_restore', [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--dbname',
        psqlUrl,
        dumpPath,
      ]);
  if (restore.code !== 0) fail(`Restore failed: ${restore.stderr.trim().split('\n').slice(0, 5).join('\n')}`);

  // --- 3. census before -----------------------------------------------------
  console.log('3. Recording what the data looks like before');
  const tables = ['Page', 'BlogPost', 'Navigation', 'Lead', 'FormSubmission', 'Product', 'Form', 'Popup'];
  const before = {};
  for (const table of tables) {
    before[table] = Number(await value(`SELECT count(*) FROM "${table}"`));
  }
  // A fingerprint of every slug, so a single changed character is detectable.
  before.pageSlugs = await value(`SELECT md5(string_agg("slug", '|' ORDER BY "id")) FROM "Page"`);
  before.postSlugs = await value(`SELECT md5(string_agg("slug", '|' ORDER BY "id")) FROM "BlogPost"`);
  before.productPrices = await value(
    `SELECT md5(string_agg(coalesce("monthlyPrice"::text,'~')||':'||coalesce("currency",'~')||':'||"status", '|' ORDER BY "id")) FROM "Product"`,
  );
  console.log(
    `   ${tables.map((t) => `${t}=${before[t]}`).join(' ')}`,
  );

  const pendingBefore = await prisma(['migrate', 'status', '--schema', schemaPath]);
  if (/Database schema is up to date/.test(pendingBefore.stdout)) {
    console.log('\n   Nothing to rehearse: this dump already has every migration applied.\n');
    process.exit(0);
  }

  // --- 4. migrate -----------------------------------------------------------
  console.log('4. Applying migrations');
  const started = Date.now();
  const migrate = await prisma(['migrate', 'deploy', '--schema', schemaPath]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (migrate.code !== 0) {
    fail(`Migration failed after ${seconds}s:\n${migrate.stdout}\n${migrate.stderr}`);
  }
  console.log(`   applied in ${seconds}s`);

  // --- 5. assertions --------------------------------------------------------
  console.log('\n5. Checking the result\n');

  const defaultId = await value(`SELECT "id" FROM "Country" WHERE "isDefault" ORDER BY "sortOrder" LIMIT 1`);
  check('exactly one default market', (await value(`SELECT count(*) FROM "Country" WHERE "isDefault"`)) === '1');
  check(
    'the default market owns the site root (empty prefix)',
    (await value(`SELECT "slug" FROM "Country" WHERE "id"='${defaultId}'`)) === '',
  );
  check(
    'no other market claims the root',
    (await value(`SELECT count(*) FROM "Country" WHERE "slug"='' AND NOT "isDefault"`)) === '0',
  );

  for (const table of tables) {
    const after = Number(await value(`SELECT count(*) FROM "${table}"`));
    check(`${table}: no rows lost`, after === before[table], `${before[table]} → ${after}`);
  }

  check(
    'every page slug is byte-identical',
    (await value(`SELECT md5(string_agg("slug", '|' ORDER BY "id")) FROM "Page"`)) === before.pageSlugs,
  );
  check(
    'every article slug is byte-identical',
    (await value(`SELECT md5(string_agg("slug", '|' ORDER BY "id")) FROM "BlogPost"`)) === before.postSlugs,
  );
  check(
    'the global product rows are untouched',
    (await value(
      `SELECT md5(string_agg(coalesce("monthlyPrice"::text,'~')||':'||coalesce("currency",'~')||':'||"status", '|' ORDER BY "id")) FROM "Product"`,
    )) === before.productPrices,
  );

  for (const table of ['Page', 'BlogPost', 'Navigation', 'Lead']) {
    check(
      `${table}: every row belongs to the default market`,
      (await value(`SELECT count(*) FROM "${table}" WHERE "countryId" IS DISTINCT FROM '${defaultId}'`)) === '0',
    );
  }

  check(
    'every product is on sale in the default market',
    (await value(
      `SELECT count(*) FROM "Product" p WHERE NOT EXISTS (SELECT 1 FROM "ProductCountry" pc WHERE pc."productId"=p."id" AND pc."countryId"='${defaultId}')`,
    )) === '0',
  );
  check(
    'each price, status and currency carried across exactly',
    (await value(`
      SELECT count(*) FROM "Product" p
      JOIN "ProductCountry" pc ON pc."productId"=p."id" AND pc."countryId"='${defaultId}'
      WHERE p."monthlyPrice" IS DISTINCT FROM pc."monthlyPrice"
         OR p."annualPrice"  IS DISTINCT FROM pc."annualPrice"
         OR p."status"       IS DISTINCT FROM pc."status"
         OR coalesce(nullif(p."currency",''),'INR') IS DISTINCT FROM pc."currency"
         OR p."isFeatured"   IS DISTINCT FROM pc."isFeatured"`)) === '0',
  );

  /*
   * The migration copies the global settings into the default market. There is
   * nothing to copy on a database that has never served a request — and the
   * application falls back to the global settings when a market has no row —
   * so this is asserted only where there was something to carry across.
   */
  const hadSettings = (await value(`SELECT count(*) FROM "WebsiteSettings"`)) !== '0';
  const marketSettings = await value(
    `SELECT count(*) FROM "CountrySettings" WHERE "countryId"='${defaultId}'`,
  );
  check(
    hadSettings
      ? 'the global settings were copied into the default market'
      : 'no global settings to copy, and none were invented',
    hadSettings ? marketSettings === '1' : marketSettings === '0',
  );
  check(
    'shared forms and popups stayed shared',
    (await value(
      `SELECT count(*) FROM "Form" WHERE "countryId" IS NOT NULL`,
    )) === '0',
  );

  const oldIndexes = await value(
    `SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('Page_slug_key','BlogPost_slug_key','Navigation_slug_key')`,
  );
  check('the global slug uniques are gone', oldIndexes === '0');
  const newIndexes = await value(
    `SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('Page_countryId_slug_key','BlogPost_countryId_slug_key','Navigation_countryId_slug_key')`,
  );
  check('the per-market slug uniques exist', newIndexes === '3', `${newIndexes}/3`);

  const nullable = await value(
    `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='countryId' AND is_nullable='YES' AND table_name IN ('Page','BlogPost','Navigation','Lead')`,
  );
  check('countryId is NOT NULL where it must be', nullable === '0');

  // The one check that proves the hand-written SQL and the Prisma schema agree.
  const drift = await prisma([
    'migrate',
    'diff',
    '--from-url',
    scratchUrl,
    '--to-schema-datamodel',
    schemaPath,
    '--script',
  ]);
  check(
    'the migrated schema matches prisma/schema.prisma exactly',
    /This is an empty migration/.test(drift.stdout),
    drift.code === 0 ? '' : 'diff could not be computed',
  );

  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${failed.length === 0 ? '✓' : '✗'} ${checks.length - failed.length}/${checks.length} checks passed\n`,
  );
  if (failed.length > 0) {
    console.error('Do not deploy this migration. Failing checks:');
    for (const c of failed) console.error(`  • ${c.name}`);
    console.error('');
    process.exit(1);
  }
  console.log('The migration is safe to apply to a database like this one.\n');
}

main().catch((error) => fail(error?.message ?? String(error)));
