#!/usr/bin/env node
/**
 * Post-deployment smoke test.
 *
 * Confirms a deployed instance is actually serving, from the outside, with no
 * credentials and nothing destructive. It is run by the Azure deployment
 * workflow after a revision reports healthy — because "the container is running"
 * and "the site works" are different claims, and only the second one matters.
 *
 * Usage:
 *   node scripts/verify-production.mjs https://example.com
 *   npm run verify:production -- https://example.com
 *
 * Exits non-zero if any required check fails, so it can gate a pipeline.
 */

const target = (process.argv[2] || process.env.VERIFY_URL || '').trim().replace(/\/+$/, '');

if (!target) {
  console.error('Usage: node scripts/verify-production.mjs <https://your-domain>');
  process.exit(2);
}

let base;
try {
  base = new URL(target);
} catch {
  console.error(`Not a valid URL: ${target}`);
  process.exit(2);
}
if (base.protocol !== 'http:' && base.protocol !== 'https:') {
  console.error('The URL must be http:// or https://');
  process.exit(2);
}

const TIMEOUT_MS = 20_000;

/**
 * One check.
 *
 * `expect` is a list of acceptable statuses rather than a single one, because
 * several of these legitimately vary: a site with no custom robots.txt may 404
 * it, and the login page redirects when a session cookie is present.
 */
const checks = [
  {
    name: 'Homepage',
    path: '/',
    expect: [200],
    required: true,
  },
  {
    name: 'Health endpoint',
    path: '/api/health',
    expect: [200],
    required: true,
    // The only check that inspects a body: a 200 from a health endpoint that
    // reports a disconnected database would otherwise pass.
    verify: (body) => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return 'response was not JSON';
      }
      if (parsed.status !== 'ok') return `status was "${parsed.status}"`;
      if (parsed.database !== 'connected') return `database was "${parsed.database}"`;
      return null;
    },
  },
  {
    name: 'Readiness endpoint',
    path: '/api/ready',
    expect: [200],
    required: true,
    verify: (body) => {
      try {
        return JSON.parse(body).status === 'ready' ? null : 'migrations may not be applied';
      } catch {
        return 'response was not JSON';
      }
    },
  },
  {
    name: 'robots.txt',
    path: '/robots.txt',
    expect: [200],
    required: true,
  },
  {
    name: 'sitemap.xml',
    path: '/sitemap.xml',
    expect: [200],
    required: true,
  },
  {
    name: 'Admin login page',
    // Mirrors LOGIN_PATH in src/lib/auth/routes.ts — a plain script cannot
    // import it, so the two are changed together.
    path: '/auth-control-panel/admin',
    // 200 signed out; a redirect if the request somehow carries a session.
    expect: [200, 302, 307],
    required: true,
  },
  {
    // The second storefront answers on its own prefix. Not required: a
    // deployment may legitimately have only the root market live, and an
    // inactive market correctly 404s.
    name: 'UAE storefront (/ae)',
    path: '/ae',
    expect: [200, 404],
    required: false,
  },
  {
    name: 'Admin is gated',
    path: '/admin',
    // Anonymous access must not reach the dashboard, and must not be told
    // where the sign-in screen is either — a redirect would carry that path in
    // a Location header. So the only acceptable answer is the one any URL that
    // does not exist gets. A 200 here would mean the guard is not running.
    expect: [404],
    required: true,
    followRedirects: false,
  },
];

async function run(check) {
  const url = new URL(check.path, base).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: check.followRedirects === false ? 'manual' : 'follow',
      headers: { 'user-agent': 'dropbox-reseller-verify/1.0', 'cache-control': 'no-cache' },
    });

    if (!check.expect.includes(response.status)) {
      return { ok: false, detail: `HTTP ${response.status} (expected ${check.expect.join(' or ')})` };
    }

    if (check.verify) {
      const problem = check.verify(await response.text());
      if (problem) return { ok: false, detail: `HTTP ${response.status} but ${problem}` };
    }

    return { ok: true, detail: `HTTP ${response.status}` };
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `no response in ${TIMEOUT_MS / 1000}s` : error?.message;
    return { ok: false, detail: reason || 'request failed' };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`Verifying ${base.origin}\n`);

let failures = 0;

for (const check of checks) {
  const result = await run(check);
  const mark = result.ok ? '✓' : check.required ? '✗' : '!';
  console.log(`${mark} ${check.name.padEnd(22)} ${check.path.padEnd(16)} ${result.detail}`);
  if (!result.ok && check.required) failures += 1;
}

console.log('');

if (failures > 0) {
  console.error(`${failures} required check(s) failed.`);
  process.exit(1);
}

console.log('All checks passed.');
