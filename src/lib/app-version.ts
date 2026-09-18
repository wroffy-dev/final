/**
 * The running application's version.
 *
 * Three facts, all frozen into the build by next.config.mjs:
 *
 *  - **version** — `package.json`'s `version`, the single authoritative source.
 *  - **releaseDate** — `package.json`'s `release.date`, moved by the same
 *    command that moves the version.
 *  - **buildCommit** — the commit the image was built from, when the builder
 *    supplied it.
 *
 * Deliberately not stored in the database. A settings row can be edited to
 * claim any version at all, including one that is not running; these values
 * cannot be anything other than what was compiled, so "Settings says 1.1.0"
 * and "1.1.0 is deployed" are the same statement.
 *
 * This is the *application* version. It is not the consent notice version,
 * which counts published wording and moves whenever an administrator edits a
 * notice — see docs/CONSENT-AND-PRIVACY.md. Neither number says anything about
 * the other, and ordinary CMS edits, consent edits, container restarts and
 * rebuilds of the same release all leave this one alone.
 */

export type AppVersion = {
  version: string;
  /** ISO date, or null when the build did not record one. */
  releaseDate: string | null;
  /** Short commit, or null when the builder did not supply one. */
  buildCommit: string | null;
};

/** Semantic version, MAJOR.MINOR.PATCH, optionally pre-release/build tagged. */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function appVersion(): AppVersion {
  const version = (process.env.APP_VERSION ?? '').trim();
  const releaseDate = (process.env.APP_RELEASE_DATE ?? '').trim();
  const buildCommit = (process.env.APP_BUILD_COMMIT ?? '').trim();

  return {
    // "unknown" rather than a guess: a wrong version number is worse than an
    // admitted missing one, because someone will act on it.
    version: SEMVER.test(version) ? version : 'unknown',
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate : null,
    buildCommit: buildCommit || null,
  };
}

/** The release date as a person reads it. */
export function formatReleaseDate(iso: string | null): string {
  if (!iso) return 'Not recorded';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
