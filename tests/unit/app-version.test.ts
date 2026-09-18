import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { appVersion, formatReleaseDate } from '@/lib/app-version';

/**
 * The version Settings shows.
 *
 * The property worth testing is not the formatting — it is that the number
 * shown is the number of the artefact that is running. `package.json` is the
 * only source, and these check that nothing else can quietly become one.
 */

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const original = {
  APP_VERSION: process.env.APP_VERSION,
  APP_RELEASE_DATE: process.env.APP_RELEASE_DATE,
  APP_BUILD_COMMIT: process.env.APP_BUILD_COMMIT,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function withEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return appVersion();
}

describe('release metadata', () => {
  it('is semantic, MAJOR.MINOR.PATCH', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('records a release date beside the version, in the same file', () => {
    expect(pkg.release?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps package-lock.json on the same version', () => {
    const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
  });

  it('is the version CHANGELOG.md and VERSION_README.md announce', () => {
    const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
    const versionDoc = readFileSync(new URL('../../VERSION_README.md', import.meta.url), 'utf8');

    expect(changelog).toContain(`## [${pkg.version}] — ${pkg.release.date}`);
    expect(versionDoc).toContain(`**Current release:** \`${pkg.version}\` — released ${pkg.release.date}`);
  });
});

describe('what Settings reads', () => {
  it('reports the version compiled into the build', () => {
    expect(withEnv({ APP_VERSION: '2.3.4', APP_RELEASE_DATE: '2026-01-31' })).toMatchObject({
      version: '2.3.4',
      releaseDate: '2026-01-31',
    });
  });

  it('admits it does not know rather than inventing a number', () => {
    expect(withEnv({ APP_VERSION: '', APP_RELEASE_DATE: '' })).toMatchObject({
      version: 'unknown',
      releaseDate: null,
      buildCommit: null,
    });
    expect(withEnv({ APP_VERSION: 'latest' }).version).toBe('unknown');
    expect(withEnv({ APP_VERSION: '1.2' }).version).toBe('unknown');
    expect(withEnv({ APP_RELEASE_DATE: 'soon' }).releaseDate).toBeNull();
  });

  it('reports the build commit only when the builder supplied one', () => {
    expect(withEnv({ APP_BUILD_COMMIT: 'a1b2c3d4e5f6' }).buildCommit).toBe('a1b2c3d4e5f6');
    expect(withEnv({ APP_BUILD_COMMIT: '' }).buildCommit).toBeNull();
  });

  it('reads a date as a person would, or says it has none', () => {
    expect(formatReleaseDate('2026-09-16')).toBe('16 September 2026');
    expect(formatReleaseDate(null)).toBe('Not recorded');
    expect(formatReleaseDate('not-a-date')).toBe('Not recorded');
  });
});
