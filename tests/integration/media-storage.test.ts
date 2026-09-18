import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mockAuth, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

/**
 * The media library, end to end, on the filesystem driver.
 *
 * Nothing here touches a bucket or a credential: the upload directory is a
 * temporary folder, which is the same arrangement a VPS, a Docker volume, a
 * Coolify volume and an Azure Files mount all present to the application. If
 * this suite passes, the site runs with no object storage configured at all —
 * which is the whole point of the driver.
 *
 * The directory is set before the modules are imported because the storage
 * factory caches its instance on first use.
 */
const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-suite-'));
process.env.UPLOAD_DIR = uploadDir;
process.env.STORAGE_DRIVER = 'local';
delete process.env.LOCAL_UPLOAD_DIR;
delete process.env.MEDIA_PUBLIC_PATH;
// Room for the fixtures below; the default 150 KB would reject nothing here,
// but the point is that the ceiling is configuration rather than code.
process.env.MAX_UPLOAD_SIZE_MB = '10';

const { prisma } = await import('@/lib/db/prisma');
const { uploadMedia, renameMedia, deleteMedia, listMedia } = await import('@/lib/actions/media');
const { storage } = await import('@/lib/storage');

const suffix = uniqueSuffix();
const created: string[] = [];

/** A file the uploader will accept, as the browser would send it. */
function upload(name: string, type: string, body: Buffer | string): FormData {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(Buffer.from(body))], name, { type }));
  return form;
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // IHDR: 4x2, so the dimension reader has something real to find.
  Buffer.from([0, 0, 0, 13]),
  Buffer.from('IHDR'),
  Buffer.from([0, 0, 0, 4, 0, 0, 0, 2]),
  Buffer.alloc(8),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const GIF = Buffer.from('GIF89a' + '\0'.repeat(16));
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(24),
]);
const PDF = Buffer.from('%PDF-1.7\n% test fixture\n');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-media-storage' },
    update: {},
    create: { slug: 'test-role-media-storage', name: 'Test Role Media', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });
});

afterAll(async () => {
  await prisma.media.deleteMany({ where: { id: { in: created } } });
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-media-storage' } });
  await prisma.$disconnect();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('uploading with no object storage configured', () => {
  it('accepts every format the library supports, and puts the bytes on disk', async () => {
    const fixtures: Array<[string, string, Buffer | string]> = [
      [`shot-${suffix}.png`, 'image/png', PNG],
      [`photo-${suffix}.jpg`, 'image/jpeg', JPEG],
      [`anim-${suffix}.gif`, 'image/gif', GIF],
      [`modern-${suffix}.webp`, 'image/webp', WEBP],
      [`logo-${suffix}.svg`, 'image/svg+xml', SVG],
      [`sheet-${suffix}.pdf`, 'application/pdf', PDF],
    ];

    for (const [name, type, body] of fixtures) {
      const result = await uploadMedia(upload(name, type, body));
      expect(result.ok, `${name}: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok || !result.data) continue;
      created.push(result.data.id);

      const row = await prisma.media.findUniqueOrThrow({ where: { id: result.data.id } });
      expect(row.provider).toBe('local');
      expect(row.mimeType).toBe(type);

      // The key is storage-neutral: no absolute path, no leading slash.
      expect(row.storageKey).not.toContain(uploadDir);
      expect(row.storageKey.startsWith('/')).toBe(false);

      // The URL is a route prefix, not a filesystem path.
      expect(row.url.startsWith('/media/')).toBe(true);
      expect(row.url).not.toContain(uploadDir);

      // And the bytes really are under the configured directory.
      const onDisk = path.join(uploadDir, row.storageKey);
      expect(await fs.readFile(onDisk)).toHaveLength(Buffer.from(body).byteLength);
    }
  });

  it('reads a PNG’s real dimensions', async () => {
    const result = await uploadMedia(upload(`sized-${suffix}.png`, 'image/png', PNG));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    created.push(result.data.id);
    expect(result.data.width).toBe(4);
    expect(result.data.height).toBe(2);
  });

  it('sanitises the name it is given', async () => {
    const result = await uploadMedia(
      upload('My Dropbox Product @2026!!.png', 'image/png', PNG),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    created.push(result.data.id);

    const row = await prisma.media.findUniqueOrThrow({ where: { id: result.data.id } });
    // Date-namespaced, lowercase, hyphenated, with an unguessable suffix.
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/my-dropbox-product-2026-[a-z0-9]+\.png$/);
  });

  it('refuses a path traversal dressed up as a filename', async () => {
    const result = await uploadMedia(upload('../../etc/passwd.png', 'image/png', PNG));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    created.push(result.data.id);

    const row = await prisma.media.findUniqueOrThrow({ where: { id: result.data.id } });
    // The traversal is gone rather than escaped: only the stem survives.
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/passwd-[a-z0-9]+\.png$/);
    expect(row.storageKey).not.toContain('..');

    const resolved = path.resolve(uploadDir, row.storageKey);
    expect(resolved.startsWith(uploadDir)).toBe(true);
  });
});

describe('what the uploader refuses', () => {
  it('rejects an executable, a forged extension and an unsupported type', async () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64)]);

    // An ELF binary announced as a PNG: the declared type is allowed, the
    // magic bytes are not the ones a PNG has.
    const forged = await uploadMedia(upload('payload.png', 'image/png', elf));
    expect(forged.ok).toBe(false);

    // An executable announced honestly: the type is not on the list.
    const honest = await uploadMedia(upload('payload.sh', 'application/x-sh', '#!/bin/sh\nid\n'));
    expect(honest.ok).toBe(false);

    // A type nothing on the site renders.
    const video = await uploadMedia(upload('clip.mp4', 'video/mp4', Buffer.alloc(32)));
    expect(video.ok).toBe(false);
  });

  it('rejects an SVG carrying script, and keeps accepting an inert one', async () => {
    const hostile = await uploadMedia(
      upload('bad.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    );
    expect(hostile.ok).toBe(false);

    const handler = await uploadMedia(
      upload('bad2.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
    );
    expect(handler.ok).toBe(false);

    const fine = await uploadMedia(upload(`inert-${suffix}.svg`, 'image/svg+xml', SVG));
    expect(fine.ok, JSON.stringify(fine)).toBe(true);
    if (fine.ok && fine.data) created.push(fine.data.id);
  });

  it('rejects a file over the configured ceiling', async () => {
    const previous = process.env.MAX_UPLOAD_SIZE_MB;
    try {
      // One kilobyte, so the fixtures below straddle it.
      process.env.MAX_UPLOAD_SIZE_MB = String(1 / 1024);
      const big = Buffer.concat([PNG, Buffer.alloc(4096)]);
      const result = await uploadMedia(upload('big.png', 'image/png', big));
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/must be .* or less/);
    } finally {
      if (previous === undefined) delete process.env.MAX_UPLOAD_SIZE_MB;
      else process.env.MAX_UPLOAD_SIZE_MB = previous;
    }
  });
});

describe('renaming', () => {
  it('changes the display name without touching the file', async () => {
    const uploaded = await uploadMedia(upload(`keep-${suffix}.png`, 'image/png', PNG));
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok || !uploaded.data) return;
    created.push(uploaded.data.id);

    const before = await prisma.media.findUniqueOrThrow({ where: { id: uploaded.data.id } });
    const result = await renameMedia({
      id: uploaded.data.id,
      filename: 'A friendlier name.png',
      slug: uploaded.data.slug,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    const after = await prisma.media.findUniqueOrThrow({ where: { id: uploaded.data.id } });
    expect(after.filename).toBe('A friendlier name.png');
    expect(after.storageKey).toBe(before.storageKey);
    expect(after.url).toBe(before.url);
    expect(await storage().exists(after.storageKey)).toBe(true);
  });

  it('changes the slug, moves the file and rewrites the URL', async () => {
    const uploaded = await uploadMedia(upload(`before-${suffix}.png`, 'image/png', PNG));
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok || !uploaded.data) return;
    created.push(uploaded.data.id);

    const oldKey = (await prisma.media.findUniqueOrThrow({ where: { id: uploaded.data.id } }))
      .storageKey;

    const result = await renameMedia({
      id: uploaded.data.id,
      filename: uploaded.data.filename,
      slug: `After The Rename ${suffix}`,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok || !result.data) return;

    const after = await prisma.media.findUniqueOrThrow({ where: { id: uploaded.data.id } });
    expect(after.storageKey).toMatch(new RegExp(`after-the-rename-${suffix}\\.png$`));
    expect(after.url).toBe(`/media/${after.storageKey}`);
    // The extension is never taken from the typed name, so a PNG cannot be
    // re-labelled as something the browser would treat differently.
    expect(after.storageKey.endsWith('.png')).toBe(true);

    // The bytes moved with it.
    expect(await storage().exists(after.storageKey)).toBe(true);
    expect(await storage().exists(oldKey)).toBe(false);
    expect(await fs.readFile(path.join(uploadDir, after.storageKey))).toHaveLength(PNG.byteLength);
  });

  it('refuses a slug that is only punctuation, and survives a collision', async () => {
    const one = await uploadMedia(upload(`clash-a-${suffix}.png`, 'image/png', PNG));
    const two = await uploadMedia(upload(`clash-b-${suffix}.png`, 'image/png', PNG));
    expect(one.ok && two.ok).toBe(true);
    if (!one.ok || !one.data || !two.ok || !two.data) return;
    created.push(one.data.id, two.data.id);

    const empty = await renameMedia({ id: one.data.id, filename: 'x.png', slug: '!!!' });
    expect(empty.ok).toBe(false);

    const target = `shared-name-${suffix}`;
    const first = await renameMedia({ id: one.data.id, filename: 'one.png', slug: target });
    const second = await renameMedia({ id: two.data.id, filename: 'two.png', slug: target });
    expect(first.ok && second.ok).toBe(true);

    const rows = await prisma.media.findMany({
      where: { id: { in: [one.data.id, two.data.id] } },
      select: { storageKey: true },
    });
    // Two rows, two distinct keys: the second gained a suffix rather than
    // overwriting the first.
    expect(new Set(rows.map((row) => row.storageKey)).size).toBe(2);
  });
});

describe('deleting', () => {
  it('removes the row and the file, and tolerates a file already gone', async () => {
    const uploaded = await uploadMedia(upload(`doomed-${suffix}.png`, 'image/png', PNG));
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok || !uploaded.data) return;

    const row = await prisma.media.findUniqueOrThrow({ where: { id: uploaded.data.id } });
    const onDisk = path.join(uploadDir, row.storageKey);
    expect(await fs.readFile(onDisk)).toBeTruthy();

    const result = await deleteMedia(uploaded.data.id);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await prisma.media.findUnique({ where: { id: uploaded.data.id } })).toBeNull();
    await expect(fs.access(onDisk)).rejects.toThrow();

    // A second upload whose file is removed underneath it still deletes
    // cleanly — a missing file must not strand the row.
    const orphan = await uploadMedia(upload(`orphan-${suffix}.png`, 'image/png', PNG));
    expect(orphan.ok).toBe(true);
    if (!orphan.ok || !orphan.data) return;
    const orphanRow = await prisma.media.findUniqueOrThrow({ where: { id: orphan.data.id } });
    await fs.rm(path.join(uploadDir, orphanRow.storageKey), { force: true });
    expect((await deleteMedia(orphan.data.id)).ok).toBe(true);
  });
});

describe('the library survives a restart', () => {
  it('still lists and resolves files written by an earlier process', async () => {
    const uploaded = await uploadMedia(upload(`durable-${suffix}.png`, 'image/png', PNG));
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok || !uploaded.data) return;
    created.push(uploaded.data.id);

    // Whatever a restart clears, it is not the directory: a fresh service
    // instance reading the same UPLOAD_DIR finds the same bytes.
    const { __resetStorage } = await import('@/lib/storage');
    __resetStorage();

    const row = await prisma.media.findUniqueOrThrow({ where: { id: uploaded.data.id } });
    expect(await storage().exists(row.storageKey)).toBe(true);

    const listed = await listMedia({ query: `durable-${suffix}` });
    expect(listed.items.some((item) => item.id === uploaded.data!.id)).toBe(true);
  });
});
