import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  safeStorageKey,
  resolveWithin,
  uploadRoot,
  mediaPublicPath,
  legacyUploadRoots,
  DEFAULT_UPLOAD_DIR,
  LEGACY_UPLOAD_DIR,
} from '@/lib/storage/paths';
import { LocalStorage } from '@/lib/storage/local';
import { storageDriver, __resetStorage } from '@/lib/storage';
import { mediaSlug } from '@/lib/services/upload';
import { slugOfKey } from '@/lib/media/dto';

/**
 * The storage layer, and the guard that stands between a URL and the disk.
 *
 * The traversal cases are the point of this file: `/media/<key>` is reachable
 * by anyone, `key` arrives from the URL, and the only thing stopping it naming
 * /etc/passwd is `safeStorageKey`. Each shape below is one that has worked
 * against a naive implementation somewhere.
 */

const ENV_NAMES = ['UPLOAD_DIR', 'LOCAL_UPLOAD_DIR', 'MEDIA_PUBLIC_PATH', 'STORAGE_DRIVER', 'STORAGE_PROVIDER'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  __resetStorage();
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  __resetStorage();
});

describe('safeStorageKey', () => {
  it('accepts the keys this application writes', () => {
    expect(safeStorageKey('2026/09/photo-a83f29.png')).toBe('2026/09/photo-a83f29.png');
    expect(safeStorageKey('file.pdf')).toBe('file.pdf');
    expect(safeStorageKey('a/b/c/d-1.webp')).toBe('a/b/c/d-1.webp');
  });

  it('refuses every way out of the directory', () => {
    for (const key of [
      '../etc/passwd',
      '../../etc/passwd',
      '2026/../../etc/passwd',
      './2026/09/x.png',
      '2026/./09/x.png',
      '/etc/passwd',
      '//etc/passwd',
      'C:/Windows/win.ini',
      '..\\..\\windows\\win.ini',
      '2026\\09\\x.png',
    ]) {
      expect(safeStorageKey(key), key).toBeNull();
    }
  });

  it('refuses anything still percent-encoded', () => {
    // Next has already decoded a route parameter by the time it arrives, so a
    // surviving % means double encoding — decoding it again is how %252e%252e
    // becomes .. one layer too late.
    for (const key of ['%2e%2e/etc/passwd', '..%2fetc%2fpasswd', '2026/%2e%2e/x.png', 'a%00.png']) {
      expect(safeStorageKey(key), key).toBeNull();
    }
  });

  it('refuses hidden files, empty segments, null bytes and nonsense', () => {
    for (const key of [
      '.env',
      '2026/.env',
      '.ssh/id_rsa',
      'a//b.png',
      'x.png\0.txt',
      '',
      ' ',
      'a b.png',
      'a;b.png',
      '$(whoami).png',
      'x'.repeat(513),
    ]) {
      expect(safeStorageKey(key), JSON.stringify(key)).toBeNull();
    }
  });
});

describe('resolveWithin', () => {
  const root = '/srv/media';

  it('maps a key to a path inside the root', () => {
    expect(resolveWithin(root, '2026/09/x.png')).toBe(path.resolve('/srv/media/2026/09/x.png'));
  });

  it('never resolves outside the root', () => {
    for (const key of ['../secrets.txt', '../../etc/passwd', '/etc/passwd']) {
      expect(resolveWithin(root, key), key).toBeNull();
    }
  });

  it('does not let a sibling directory pass as the root', () => {
    // /srv/media-private starts with the root string but is not inside it.
    const escaped = resolveWithin('/srv/media', '../media-private/x.png');
    expect(escaped).toBeNull();
  });
});

describe('upload root resolution', () => {
  it('prefers UPLOAD_DIR, then the legacy name, then the default', () => {
    process.env.UPLOAD_DIR = '/mnt/media';
    process.env.LOCAL_UPLOAD_DIR = 'public/uploads';
    expect(uploadRoot()).toBe('/mnt/media');

    delete process.env.UPLOAD_DIR;
    // An installation that only ever set the old name keeps its directory.
    expect(uploadRoot()).toBe(path.resolve(process.cwd(), 'public/uploads'));

    delete process.env.LOCAL_UPLOAD_DIR;
    expect(uploadRoot()).toBe(DEFAULT_UPLOAD_DIR);
  });

  it('keeps the old directory readable, and stops when it is the same one', () => {
    process.env.UPLOAD_DIR = '/mnt/media';
    expect(legacyUploadRoots()).toEqual([path.resolve(process.cwd(), LEGACY_UPLOAD_DIR)]);

    process.env.UPLOAD_DIR = LEGACY_UPLOAD_DIR;
    expect(legacyUploadRoots()).toEqual([]);
  });

  it('normalises the public prefix and never returns a filesystem path', () => {
    expect(mediaPublicPath()).toBe('/media');
    process.env.MEDIA_PUBLIC_PATH = 'files/';
    expect(mediaPublicPath()).toBe('/files');
    process.env.MEDIA_PUBLIC_PATH = '/assets/';
    expect(mediaPublicPath()).toBe('/assets');
  });
});

describe('storageDriver', () => {
  it('reads STORAGE_DRIVER first, then STORAGE_PROVIDER, then local', () => {
    expect(storageDriver()).toBe('local');

    process.env.STORAGE_PROVIDER = 'r2';
    expect(storageDriver()).toBe('r2');

    process.env.STORAGE_DRIVER = 's3';
    expect(storageDriver()).toBe('s3');
  });

  it('treats anything unrecognised as local rather than failing to boot', () => {
    // A typo in this variable must not be the reason a container will not
    // start, and local is the driver that needs nothing configured.
    for (const value of ['', '  ', 'azure', 'blob', 'nonsense']) {
      process.env.STORAGE_DRIVER = value;
      expect(storageDriver(), value).toBe('local');
    }
  });

  it('tolerates case and surrounding whitespace on the real names', () => {
    for (const [value, expected] of [
      [' S3 ', 's3'],
      ['R2', 'r2'],
      ['Local', 'local'],
    ] as const) {
      process.env.STORAGE_DRIVER = value;
      expect(storageDriver(), value).toBe(expected);
    }
  });
});

describe('slugs', () => {
  it('turns a typed name into something safe to put in a path', () => {
    expect(mediaSlug('My Dropbox Product @2026!!.png')).toBe('my-dropbox-product-2026');
    expect(mediaSlug('../../etc/passwd')).toBe('passwd');
    expect(mediaSlug('.env')).toBe('env');
    expect(mediaSlug('  spaced   out  ')).toBe('spaced-out');
    expect(mediaSlug('!!!')).toBe('');
  });

  it('reads the editable stem back out of a key', () => {
    expect(slugOfKey('2026/09/photo-a83f29.png')).toBe('photo-a83f29');
    expect(slugOfKey('file.pdf')).toBe('file');
  });
});

describe('LocalStorage', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-'));
    process.env.UPLOAD_DIR = dir;
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes, finds, moves and deletes a file', async () => {
    const store = new LocalStorage();
    const body = Buffer.from('hello');

    const stored = await store.put({ key: '2026/09/a.png', body, mimeType: 'image/png' });
    expect(stored.provider).toBe('local');
    expect(stored.size).toBe(5);
    expect(await store.exists('2026/09/a.png')).toBe(true);
    expect(await fs.readFile(path.join(dir, '2026/09/a.png'), 'utf8')).toBe('hello');

    await store.move('2026/09/a.png', '2026/09/b.png');
    expect(await store.exists('2026/09/a.png')).toBe(false);
    expect(await store.exists('2026/09/b.png')).toBe(true);

    await store.delete('2026/09/b.png');
    expect(await store.exists('2026/09/b.png')).toBe(false);
  });

  it('publishes a URL prefix, never the filesystem path', () => {
    const url = new LocalStorage().publicUrl('2026/09/a.png');
    expect(url).toBe('/media/2026/09/a.png');
    expect(url).not.toContain(dir);
    expect(url).not.toContain('/data/uploads');
  });

  it('refuses to write or read outside the upload directory', async () => {
    const store = new LocalStorage();
    await expect(
      store.put({ key: '../escaped.png', body: Buffer.from('x'), mimeType: 'image/png' }),
    ).rejects.toThrow(/Invalid storage key/);

    expect(await store.exists('../escaped.png')).toBe(false);
    expect(await store.locate('../../etc/passwd')).toBeNull();
    // A delete that cannot resolve is a no-op, not an unlink somewhere else.
    await expect(store.delete('../escaped.png')).resolves.toBeUndefined();
  });

  it('deleting a missing file is not an error', async () => {
    await expect(new LocalStorage().delete('2026/09/gone.png')).resolves.toBeUndefined();
  });

  it('reports whether the directory is usable', async () => {
    const health = await new LocalStorage().health();
    expect(health).toMatchObject({ driver: 'local', exists: true, writable: true });
    expect(health.location).toBe(dir);
  });
});

describe('legacy uploads keep serving', () => {
  it('reads a file left in public/uploads after the move to UPLOAD_DIR', async () => {
    const primary = await fs.mkdtemp(path.join(os.tmpdir(), 'media-new-'));
    const legacy = path.resolve(process.cwd(), LEGACY_UPLOAD_DIR);
    const key = `2019/01/legacy-${Date.now()}.png`;
    const legacyFile = path.join(legacy, key);

    try {
      await fs.mkdir(path.dirname(legacyFile), { recursive: true });
      await fs.writeFile(legacyFile, 'old');
      process.env.UPLOAD_DIR = primary;

      const store = new LocalStorage();
      // Nothing was migrated, and the file still resolves.
      expect(await store.exists(key)).toBe(true);
      expect(await store.locate(key)).toBe(legacyFile);

      // Renaming it brings it onto the new volume.
      const moved = `2019/01/renamed-${Date.now()}.png`;
      await store.move(key, moved);
      expect(await store.locate(moved)).toBe(path.join(primary, moved));
      expect(await store.exists(key)).toBe(false);
    } finally {
      await fs.rm(legacyFile, { force: true });
      await fs.rm(path.join(legacy, '2019'), { recursive: true, force: true });
      await fs.rm(primary, { recursive: true, force: true });
    }
  });
});
