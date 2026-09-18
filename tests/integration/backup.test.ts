import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mockAuth, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

const backupRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
process.env.BACKUP_STORAGE_DRIVER = 'local';
process.env.BACKUP_LOCAL_PATH = backupRoot;

const { prisma } = await import('@/lib/db/prisma');
const { createBackup, deleteBackup, getBackupOverview } = await import('@/lib/backup/backup.service');
const { restoreFromBackup } = await import('@/lib/backup/database-restore.service');
const { importBackupArchive } = await import('@/lib/backup/import.service');
const { checksumFile, checksumMatches } = await import('@/lib/backup/checksum.service');
const { readArchiveEntry, listArchiveEntries, isSafeArchivePath, createArchive } = await import(
  '@/lib/backup/archive'
);
const { ARCHIVE_PATHS, readManifest, MANIFEST_VERSION, APPLICATION_ID } = await import(
  '@/lib/backup/manifest'
);
const { backupStorage, __resetBackupStorage, LocalBackupStorage } = await import(
  '@/lib/backup/storage'
);
const { withBackupLock, BackupBusyError } = await import('@/lib/backup/lock.service');
const { databaseToolsAvailable } = await import('@/lib/backup/database-backup.service');
const { isMaintenanceMode, setMaintenanceMode } = await import('@/lib/backup/maintenance');
const { planRetention } = await import('@/lib/backup/retention.service');
const { computeNextRun } = await import('@/lib/backup/schedule.service');

const suffix = uniqueSuffix();
const created: string[] = [];

/** pg_dump must exist for the real backup paths; skip those if it does not. */
const tools = await databaseToolsAvailable();

beforeAll(async () => {
  __resetBackupStorage();
  // A run killed mid-restore leaves a claim with a six-hour TTL, which would
  // otherwise make every later run fail for the right reason at the wrong time.
  await prisma.backupLock.deleteMany({});
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-backup' },
    update: {},
    create: { slug: 'test-role-backup', name: 'Test Role Backup', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
});

afterAll(async () => {
  await prisma.backupRestore.deleteMany({ where: { backupId: { in: created } } });
  await prisma.backup.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-backup' } });
  await fsp.rm(backupRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('archive path safety', () => {
  it('accepts ordinary entry paths', () => {
    for (const safe of ['backup/manifest.json', 'backup/media/2026/03/a.webp', 'a.txt']) {
      expect(isSafeArchivePath(safe), safe).toBe(true);
    }
  });

  it('rejects every traversal and absolute form', () => {
    for (const hostile of [
      '../etc/passwd',
      'backup/../../etc/passwd',
      '/etc/passwd',
      'C:\\Windows\\system32',
      '\\\\server\\share',
      'backup/media/../../../root/.ssh/authorized_keys',
      '..',
      'a/../../b',
    ]) {
      expect(isSafeArchivePath(hostile), hostile).toBe(false);
    }
  });

  it('rejects a null byte and an over-long path', () => {
    expect(isSafeArchivePath('a\0b')).toBe(false);
    expect(isSafeArchivePath('a/'.repeat(600))).toBe(false);
  });
});

describe('manifest versioning', () => {
  const base = {
    version: MANIFEST_VERSION,
    application: APPLICATION_ID,
    backupType: 'FULL',
    createdAt: new Date().toISOString(),
  };

  it('accepts a manifest this build wrote', () => {
    const result = readManifest(base);
    expect(result.ok).toBe(true);
  });

  it('refuses a future version with the documented message', () => {
    const result = readManifest({ ...base, version: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'This backup format is not supported by the current application version.',
      );
    }
  });

  it("refuses another application's archive", () => {
    const result = readManifest({ ...base, application: 'some-other-app' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/different application/i);
  });

  it('refuses a malformed manifest before complaining about its version', () => {
    const result = readManifest({ nonsense: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid manifest/i);
  });
});

describe('checksums', () => {
  it('detects a single changed byte', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sum-'));
    const file = path.join(dir, 'a.bin');
    await fsp.writeFile(file, 'the original contents');
    const original = await checksumFile(file);

    await fsp.writeFile(file, 'the original contentt');
    const modified = await checksumFile(file);

    expect(original).toHaveLength(64);
    expect(checksumMatches(original, original)).toBe(true);
    expect(checksumMatches(original, modified)).toBe(false);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('never matches on length mismatch or empty input', () => {
    expect(checksumMatches('abc', 'abcd')).toBe(false);
    expect(checksumMatches('', '')).toBe(false);
  });
});

describe('local backup storage', () => {
  it('round-trips an archive and reports its size', async () => {
    const storage = new LocalBackupStorage(backupRoot);
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'up-'));
    const file = path.join(dir, 'x.zip');
    await fsp.writeFile(file, 'payload');

    const { size } = await storage.upload('2026/x.zip', fs.createReadStream(file));
    expect(size).toBe(7);
    expect(await storage.exists('2026/x.zip')).toBe(true);

    const chunks: Buffer[] = [];
    for await (const chunk of await storage.download('2026/x.zip')) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('payload');

    await storage.delete('2026/x.zip');
    expect(await storage.exists('2026/x.zip')).toBe(false);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('refuses a key that would escape the backup directory', async () => {
    const storage = new LocalBackupStorage(backupRoot);
    for (const key of ['../escape.zip', '/etc/passwd', 'a/../../b.zip']) {
      await expect(storage.exists(key)).resolves.toBe(false);
      await expect(storage.delete(key)).rejects.toThrow(/not valid/i);
    }
  });

  it('has no signed URL, so downloads go through the authenticated route', async () => {
    const storage = new LocalBackupStorage(backupRoot);
    expect(await storage.getSignedDownloadUrl()).toBeNull();
  });

  it('reports a writable directory as healthy', async () => {
    const storage = new LocalBackupStorage(backupRoot);
    expect(await storage.healthCheck()).toEqual({ ok: true });
  });

  it('reports an unwritable directory as unhealthy rather than throwing', async () => {
    // A regular file cannot be a parent directory, so mkdir is guaranteed to
    // fail — this is the read-only/unmountable volume case.
    const storage = new LocalBackupStorage('/etc/hostname/backups');
    const result = await storage.healthCheck();
    expect(result.ok).toBe(false);
  });
});

describe('concurrency lock', () => {
  it('refuses a second critical operation while one holds the lock', async () => {
    // Postgres advisory locks are re-entrant within a session and Prisma pools
    // connections, so a nested acquire is precisely the case a naive advisory
    // lock lets through. It must be refused.
    let inner: unknown = null;
    await withBackupLock(async () => {
      inner = await withBackupLock(async () => 'should not run').catch((error) => error);
    });
    expect(inner).toBeInstanceOf(BackupBusyError);
  });

  it('refuses a genuinely concurrent acquisition', async () => {
    const results = await Promise.allSettled([
      withBackupLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return 'first';
      }),
      new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
        withBackupLock(async () => 'second'),
      ),
    ]);

    // Exactly one runs; the other is told the system is busy.
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BackupBusyError);
  });

  it('lapses a claim left behind by a crashed process', async () => {
    const { prisma: db } = await import('@/lib/db/prisma');
    // A claim whose holder died: already expired, so it must not block.
    await db.backupLock.upsert({
      where: { id: 'singleton' },
      update: { operation: 'BACKUP', holder: 'dead', expiresAt: new Date(Date.now() - 1000) },
      create: {
        id: 'singleton',
        operation: 'BACKUP',
        holder: 'dead',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(withBackupLock(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('releases the lock even when the work throws', async () => {
    await expect(
      withBackupLock(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Freed, so the next operation succeeds.
    await expect(withBackupLock(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('maintenance mode', () => {
  it('toggles and reports the flag', async () => {
    await setMaintenanceMode(true);
    expect(await isMaintenanceMode()).toBe(true);
    await setMaintenanceMode(false);
    expect(await isMaintenanceMode()).toBe(false);
  });
});

describe.runIf(tools.available)('backup creation and restore', () => {
  beforeEach(() => __resetBackupStorage());

  it('creates a DATABASE backup with a manifest and a verified checksum', async () => {
    const backup = await createBackup({ type: 'DATABASE', actor: TEST_ACTOR });
    created.push(backup.id);

    expect(backup.status).toBe('COMPLETED');
    expect(backup.databaseIncluded).toBe(true);
    expect(backup.mediaIncluded).toBe(false);
    expect(backup.checksum).toHaveLength(64);
    expect(Number(backup.sizeBytes)).toBeGreaterThan(0);
    expect(backup.fileName).toMatch(/^dropbox-reseller-database-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);

    // The archive really is on disk, and its checksum matches what was stored.
    const archive = path.join(backupRoot, backup.storageKey!);
    expect(fs.existsSync(archive)).toBe(true);
    expect(checksumMatches(backup.checksum!, await checksumFile(archive))).toBe(true);

    // And it contains what the manifest claims.
    const entries = await listArchiveEntries(archive);
    expect(entries).toContain(ARCHIVE_PATHS.manifest);
    expect(entries).toContain(ARCHIVE_PATHS.databaseDump);

    const manifest = JSON.parse((await readArchiveEntry(archive, ARCHIVE_PATHS.manifest))!);
    expect(readManifest(manifest).ok).toBe(true);
    expect(manifest.databaseFormat).toBe('pg_custom');
    expect(manifest.backupType).toBe('DATABASE');
  }, 120_000);

  it('never writes a secret into the manifest', async () => {
    const backup = await createBackup({ type: 'DATABASE', actor: TEST_ACTOR });
    created.push(backup.id);

    const archive = path.join(backupRoot, backup.storageKey!);
    const manifestText = (await readArchiveEntry(archive, ARCHIVE_PATHS.manifest))!;

    expect(manifestText).not.toContain('postgresql://');
    expect(manifestText.toLowerCase()).not.toContain('password');
    for (const secret of [process.env.DATABASE_URL, process.env.AUTH_SECRET]) {
      if (secret && secret.length >= 8) expect(manifestText).not.toContain(secret);
    }
  }, 120_000);

  it('creates a MEDIA backup that carries no database dump', async () => {
    const backup = await createBackup({ type: 'MEDIA', actor: TEST_ACTOR });
    created.push(backup.id);

    expect(backup.status).toBe('COMPLETED');
    expect(backup.databaseIncluded).toBe(false);

    const entries = await listArchiveEntries(path.join(backupRoot, backup.storageKey!));
    expect(entries).toContain(ARCHIVE_PATHS.manifest);
    expect(entries).not.toContain(ARCHIVE_PATHS.databaseDump);
  }, 120_000);

  it('creates a FULL backup carrying both halves', async () => {
    const backup = await createBackup({ type: 'FULL', actor: TEST_ACTOR });
    created.push(backup.id);

    expect(backup.status).toBe('COMPLETED');
    expect(backup.databaseIncluded).toBe(true);
    expect(backup.mediaIncluded).toBe(true);
  }, 180_000);

  it('restores a backup, taking a safety backup first', async () => {
    // A marker row that must survive the round trip.
    const marker = `backup-marker-${suffix}`;
    await prisma.pageCategory.create({
      data: { name: marker, slug: marker, sortOrder: 0 },
    });

    const backup = await createBackup({ type: 'DATABASE', actor: TEST_ACTOR });
    created.push(backup.id);
    expect(backup.status).toBe('COMPLETED');

    // Change the database after the backup, so a successful restore undoes it.
    await prisma.pageCategory.deleteMany({ where: { slug: marker } });
    expect(await prisma.pageCategory.count({ where: { slug: marker } })).toBe(0);

    const result = await restoreFromBackup(backup.id, TEST_ACTOR);

    // The marker is back.
    expect(await prisma.pageCategory.count({ where: { slug: marker } })).toBe(1);

    // A safety backup was taken and kept.
    expect(result.safetyBackupId).toBeTruthy();
    const safety = await prisma.backup.findUnique({ where: { id: result.safetyBackupId } });
    expect(safety?.origin).toBe('SAFETY');
    expect(safety?.status).toBe('COMPLETED');

    // Maintenance mode was lifted again.
    expect(await isMaintenanceMode()).toBe(false);

    await prisma.pageCategory.deleteMany({ where: { slug: marker } });
  }, 300_000);

  it('aborts a restore when the checksum does not match, changing nothing', async () => {
    const backup = await createBackup({ type: 'DATABASE', actor: TEST_ACTOR });
    created.push(backup.id);

    // Corrupt the recorded checksum, as a damaged archive would.
    await prisma.backup.update({
      where: { id: backup.id },
      data: { checksum: 'f'.repeat(64) },
    });

    await expect(restoreFromBackup(backup.id, TEST_ACTOR)).rejects.toThrow(
      /integrity verification failed/i,
    );

    // The site is not left in maintenance mode by the failure.
    expect(await isMaintenanceMode()).toBe(false);

    // And the safety backup taken before the abort is retained.
    const safety = await prisma.backup.findFirst({
      where: { origin: 'SAFETY' },
      orderBy: { createdAt: 'desc' },
    });
    expect(safety?.status).toBe('COMPLETED');
  }, 300_000);

  it('refuses to restore a backup that never completed', async () => {
    const pending = await prisma.backup.create({
      data: { type: 'FULL', status: 'FAILED', storage: 'LOCAL', fileName: 'x.zip' },
    });
    created.push(pending.id);
    await expect(restoreFromBackup(pending.id, TEST_ACTOR)).rejects.toThrow(/completed backup/i);
  });

  it('deletes a backup and its archive', async () => {
    const backup = await createBackup({ type: 'DATABASE', actor: TEST_ACTOR });
    const archive = path.join(backupRoot, backup.storageKey!);
    expect(fs.existsSync(archive)).toBe(true);

    await deleteBackup(backup.id, TEST_ACTOR);

    expect(fs.existsSync(archive)).toBe(false);
    expect(await prisma.backup.count({ where: { id: backup.id } })).toBe(0);
  }, 120_000);

  it('refuses to delete a backup that is still running', async () => {
    const running = await prisma.backup.create({
      data: { type: 'FULL', status: 'RUNNING', storage: 'LOCAL' },
    });
    created.push(running.id);
    await expect(deleteBackup(running.id, TEST_ACTOR)).rejects.toThrow(/still in progress/i);
    await prisma.backup.delete({ where: { id: running.id } });
  });

  it('reports an overview the admin screen can render', async () => {
    const overview = await getBackupOverview();
    expect(overview.total).toBeGreaterThanOrEqual(0);
    expect(typeof overview.totalBytes).toBe('number');
    expect(typeof overview.scheduleEnabled).toBe('boolean');
  });
});

describe('backup import', () => {
  async function zipWith(entries: Array<{ archivePath: string; content: string }>) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mkzip-'));
    const file = path.join(dir, 'import.zip');
    await createArchive(
      file,
      entries.map((entry) => ({ type: 'content' as const, ...entry })),
    );
    return { file, dir };
  }

  function asFile(buffer: Buffer, name = 'backup.zip'): File {
    return new File([new Uint8Array(buffer)], name, { type: 'application/zip' });
  }

  it('accepts a valid archive and files it as IMPORTED without restoring', async () => {
    const manifest = {
      version: MANIFEST_VERSION,
      application: APPLICATION_ID,
      backupType: 'MEDIA',
      createdAt: new Date().toISOString(),
      mediaIncluded: true,
      databaseIncluded: false,
    };
    const { file, dir } = await zipWith([
      { archivePath: ARCHIVE_PATHS.manifest, content: JSON.stringify(manifest) },
    ]);

    const result = await importBackupArchive(asFile(await fsp.readFile(file)), TEST_ACTOR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      created.push(result.backup.id);
      expect(result.backup.origin).toBe('IMPORTED');
      // Imported, never auto-restored.
      expect(result.backup.status).toBe('COMPLETED');
      expect(result.backup.checksum).toHaveLength(64);
    }
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('rejects an archive whose manifest version is unsupported', async () => {
    const { file, dir } = await zipWith([
      {
        archivePath: ARCHIVE_PATHS.manifest,
        content: JSON.stringify({
          version: 99,
          application: APPLICATION_ID,
          backupType: 'FULL',
          createdAt: new Date().toISOString(),
        }),
      },
    ]);
    const result = await importBackupArchive(asFile(await fsp.readFile(file)), TEST_ACTOR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not supported/i);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('rejects an archive with no manifest', async () => {
    const { file, dir } = await zipWith([{ archivePath: 'random.txt', content: 'hello' }]);
    const result = await importBackupArchive(asFile(await fsp.readFile(file)), TEST_ACTOR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/manifest/i);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('rejects a manifest that claims a database it does not carry', async () => {
    const { file, dir } = await zipWith([
      {
        archivePath: ARCHIVE_PATHS.manifest,
        content: JSON.stringify({
          version: MANIFEST_VERSION,
          application: APPLICATION_ID,
          backupType: 'FULL',
          createdAt: new Date().toISOString(),
          databaseIncluded: true,
        }),
      },
    ]);
    const result = await importBackupArchive(asFile(await fsp.readFile(file)), TEST_ACTOR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/dump is missing/i);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('rejects a file that is not a ZIP at all', async () => {
    const result = await importBackupArchive(
      asFile(Buffer.from('this is not a zip file')),
      TEST_ACTOR,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a readable zip/i);
  });

  it('rejects a non-zip extension and an empty file', async () => {
    const notZip = await importBackupArchive(asFile(Buffer.from('x'), 'backup.tar'), TEST_ACTOR);
    expect(notZip.ok).toBe(false);

    const empty = await importBackupArchive(asFile(Buffer.alloc(0)), TEST_ACTOR);
    expect(empty.ok).toBe(false);
  });
});

describe('retention policy', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date('2026-06-15T03:00:00.000Z');

  function scheduled(id: string, daysAgo: number, overrides: Partial<{ origin: string; status: string }> = {}) {
    return {
      id,
      createdAt: new Date(now.getTime() - daysAgo * day),
      origin: 'SCHEDULED',
      status: 'COMPLETED',
      ...overrides,
    };
  }

  const limits = { daily: 3, weekly: 2, monthly: 1 };

  it('keeps the configured number of daily backups and drops the rest', () => {
    const candidates = [0, 1, 2, 3, 4, 5].map((d) => scheduled(`d${d}`, d));
    const plan = planRetention(candidates, { daily: 3, weekly: 0, monthly: 0 });

    expect(plan.keep).toEqual(expect.arrayContaining(['d0', 'd1', 'd2']));
    expect(plan.remove.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['d3', 'd4', 'd5']),
    );
  });

  it('never prunes the most recent successful backup, whatever the limits say', () => {
    const plan = planRetention([scheduled('only', 400)], { daily: 0, weekly: 0, monthly: 0 });

    expect(plan.keep).toContain('only');
    expect(plan.remove).toHaveLength(0);
  });

  it('never prunes a safety backup — it is the only way back from a restore', () => {
    const candidates = [
      scheduled('fresh', 0),
      scheduled('safety', 300, { origin: 'SAFETY' }),
    ];
    const plan = planRetention(candidates, limits);

    expect(plan.keep).toContain('safety');
    expect(plan.remove.map((entry) => entry.id)).not.toContain('safety');
  });

  it('never prunes a manual or imported backup', () => {
    const candidates = [
      scheduled('fresh', 0),
      scheduled('manual', 300, { origin: 'MANUAL' }),
      scheduled('imported', 300, { origin: 'IMPORTED' }),
    ];
    const plan = planRetention(candidates, limits);
    const removed = plan.remove.map((entry) => entry.id);

    expect(removed).not.toContain('manual');
    expect(removed).not.toContain('imported');
  });

  it('never prunes a backup that is still running', () => {
    const candidates = [
      scheduled('fresh', 0),
      scheduled('running', 300, { status: 'RUNNING' }),
      scheduled('failed', 300, { status: 'FAILED' }),
    ];
    const plan = planRetention(candidates, limits);
    const removed = plan.remove.map((entry) => entry.id);

    expect(removed).not.toContain('running');
    expect(removed).not.toContain('failed');
  });

  it('keeps one representative per week and per month', () => {
    // Two per day over three weeks: dailies cover the newest, then the weekly
    // and monthly tiers should each hold one older survivor back.
    const candidates: ReturnType<typeof scheduled>[] = [];
    for (let d = 0; d < 21; d += 1) {
      candidates.push(scheduled(`a${d}`, d));
      candidates.push(scheduled(`b${d}`, d));
    }

    const plan = planRetention(candidates, { daily: 2, weekly: 3, monthly: 1 });

    // Every id appears in exactly one of the two lists.
    const all = new Set([...plan.keep, ...plan.remove.map((entry) => entry.id)]);
    expect(all.size).toBe(candidates.length);
    // More than the daily tier alone would have kept.
    expect(plan.keep.length).toBeGreaterThan(2);
    expect(plan.remove.length).toBeGreaterThan(0);
  });
});

describe('schedule arithmetic', () => {
  const base = {
    frequency: 'daily',
    hour: 3,
    minute: 30,
    dayOfWeek: 0,
    dayOfMonth: 1,
    timezone: 'Asia/Kolkata',
  };

  it('computes the next daily run in the configured timezone', () => {
    // 03:30 IST is 22:00 UTC the previous day.
    const from = new Date('2026-06-15T00:00:00.000Z'); // 05:30 IST, already past
    const next = computeNextRun(base, from);

    expect(next.toISOString()).toBe('2026-06-15T22:00:00.000Z');
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it('always returns an instant in the future', () => {
    for (const frequency of ['daily', 'weekly', 'monthly'] as const) {
      const from = new Date('2026-02-27T18:45:00.000Z');
      const next = computeNextRun({ ...base, frequency }, from);
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    }
  });

  it('honours daylight saving in a zone that observes it', () => {
    // London is UTC+1 in July, so 03:30 local is 02:30 UTC.
    const next = computeNextRun(
      { ...base, timezone: 'Europe/London' },
      new Date('2026-07-10T12:00:00.000Z'),
    );
    expect(next.toISOString()).toBe('2026-07-11T02:30:00.000Z');
  });

  it('caps a monthly schedule at a day that exists in every month', () => {
    const next = computeNextRun(
      { ...base, frequency: 'monthly', dayOfMonth: 31 },
      new Date('2026-01-15T00:00:00.000Z'),
    );
    expect(next.getUTCDate()).toBeLessThanOrEqual(28);
  });
});
