#!/usr/bin/env node
/**
 * Moves the application to a new release.
 *
 *   npm run release -- patch      1.1.0 -> 1.1.1   a fix, no behaviour change
 *   npm run release -- minor      1.1.0 -> 1.2.0   new behaviour, compatible
 *   npm run release -- major      1.1.0 -> 2.0.0   a breaking change
 *   npm run release -- 1.4.2      an exact version
 *   npm run release -- minor --dry-run    print what would change
 *
 * It touches four things and nothing else:
 *
 *   package.json         version + release.date   (the authoritative source)
 *   package-lock.json    version, via npm itself, so the two cannot drift
 *   CHANGELOG.md         renames the Unreleased heading to this version
 *   VERSION_README.md    the "current release" line
 *
 * It deliberately does **not** commit, tag, push or deploy. A release is a
 * decision; this only writes the files that record it, so the change can be
 * reviewed in a diff like any other. Tag and deploy yourself afterwards.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((arg) => !arg.startsWith('-'));

const KINDS = new Set(['patch', 'minor', 'major']);
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

if (!bump || (!KINDS.has(bump) && !EXACT.test(bump))) {
  console.error('Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]');
  process.exit(1);
}

const pkgPath = join(root, 'package.json');
const current = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
const next = KINDS.has(bump) ? increment(current, bump) : bump;
const today = new Date().toISOString().slice(0, 10);

console.log(`${current} -> ${next}  (release date ${today})`);

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

/*
 * npm owns the version field, so it owns the bump: running it here is what
 * keeps package-lock.json in step. Without `--no-git-tag-version` npm would
 * commit and tag, which is exactly the part that has to stay a human decision.
 */
execFileSync('npm', ['version', '--no-git-tag-version', '--allow-same-version', next], {
  cwd: root,
  stdio: 'inherit',
});

// The release date lives beside the version, in the same file, so one command
// moves both and neither can be updated without the other.
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.release = { ...(pkg.release ?? {}), date: today };
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('package.json   version + release.date');

rewrite('CHANGELOG.md', (text) =>
  text.replace(/^## \[Unreleased\].*$/m, `## [${next}] — ${today}`),
);

rewrite('VERSION_README.md', (text) =>
  text.replace(
    /^\*\*Current release:\*\* .*$/m,
    `**Current release:** \`${next}\` — released ${today}`,
  ),
);

console.log(`
Nothing has been committed, tagged, pushed or deployed.

Next:
  1. Add this release's entries under the new CHANGELOG heading.
  2. git add -A && git commit -m "Release ${next}"
  3. Deploy. Settings -> Application information will read ${next} once the
     new image is running; it does not change until then.
`);

function increment(version, kind) {
  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
  if ([major, minor, patch].some(Number.isNaN)) {
    throw new Error(`package.json version "${version}" is not MAJOR.MINOR.PATCH`);
  }
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Rewrites a file when it exists and the edit actually matched. */
function rewrite(name, transform) {
  const path = join(root, name);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    console.log(`${name.padEnd(14)} missing, skipped`);
    return;
  }
  const updated = transform(text);
  if (updated === text) {
    console.log(`${name.padEnd(14)} no heading to move — edit it by hand`);
    return;
  }
  writeFileSync(path, updated);
  console.log(`${name.padEnd(14)} updated`);
}
