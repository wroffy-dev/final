import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * HSTS, only where it is both meaningful and safe.
 *
 * The header instructs browsers to refuse plain HTTP for this host for two
 * years, and `includeSubDomains` extends that to every subdomain. Sent from a
 * development server on localhost it can make a developer's other local
 * projects unreachable over http — a confusing, persistent, browser-level
 * problem that no code change fixes.
 *
 * Azure Container Apps terminates TLS in front of the container and serves the
 * app over HTTPS, so production gets the header and local development does not.
 * `preload` is deliberately omitted: submitting a domain to the HSTS preload
 * list is effectively irreversible and is the site owner's decision, not a
 * default.
 */
const hstsHeader =
  process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
      ]
    : [];

/**
 * The running application's identity, frozen into the build.
 *
 * `package.json` is the single authoritative source for the version: one file,
 * changed by one command, and the same file npm itself versions — so the
 * number in Settings is necessarily the number of the artefact that is
 * running. A database column would be editable to say anything at all, which
 * is exactly what a version must not be.
 *
 * Inlined here rather than imported at runtime because the standalone output
 * does not ship the repository's package.json in a place the app can reliably
 * read, and a version that sometimes resolves is worse than one that always
 * does.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * The commit the image was built from, when the build was told.
 *
 * `.git` is excluded from the Docker build context, so a local `git rev-parse`
 * cannot be the mechanism in production — it is only a convenience for a
 * developer running `next build` in a checkout. CI and PaaS builders each name
 * this differently; all the common ones are accepted so nothing has to be
 * configured by hand for the field to be populated.
 */
function buildCommit() {
  const fromEnv =
    process.env.BUILD_COMMIT ||
    process.env.SOURCE_COMMIT ||
    process.env.GITHUB_SHA ||
    process.env.COOLIFY_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);

  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // No git, no build arg: the field is simply absent rather than invented.
    return '';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * Read by src/lib/app-version.ts. These are build-time constants: they
   * change when a new image is built, and never when content is edited, a
   * consent notice is published or a container restarts.
   */
  env: {
    APP_VERSION: pkg.version,
    APP_RELEASE_DATE: pkg.release?.date ?? '',
    APP_BUILD_COMMIT: buildCommit(),
  },
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The build fails on lint errors — a conditional hook should never ship.
  eslint: { ignoreDuringBuilds: false },
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'nodemailer'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Deny framing outright — nothing here is meant to be embedded.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          ...hstsHeader,
        ],
      },
      {
        // Uploaded files are served as-is, so stop the browser guessing a type
        // and never let one render as a document in the site's origin. The
        // sandboxing CSP is what makes serving a user-supplied SVG safe: it
        // cannot run script or fetch anything, whatever the file contains.
        //
        // `/media` is the current prefix and `/uploads` the one it replaced;
        // both are still routed, so both need the same headers.
        source: '/:prefix(media|uploads)/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Disposition', value: 'inline' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // The sign-in screen. Kept out of robots.txt on purpose — that file is
        // public — so the no-index instruction is given here instead, where
        // only a crawler that already found the page will read it. The path
        // itself is defined in src/lib/auth/routes.ts; this config cannot
        // import TypeScript, so the two must be changed together.
        source: '/auth-control-panel/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
