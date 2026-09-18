import type { CountryContext } from './types';
import { LOGIN_PATH_SEGMENT } from '@/lib/auth/routes';

/**
 * The country routing engine.
 *
 * Everything in this module is pure and free of Next.js and Prisma, so the
 * rules that decide "which market is this URL in?" and "what does this link
 * look like in that market?" can be unit-tested on their own and reused on the
 * server, in the browser and in the admin.
 *
 * Two invariants hold everywhere:
 *
 *   - the default market owns the site root, so its URLs never gain a prefix
 *     and the original single-country URLs keep working byte-for-byte;
 *   - a path whose first segment is a system route is never read as a market,
 *     so /admin, /api and the rest cannot be captured by a market prefix.
 */

/**
 * First path segments that can never be a market prefix.
 *
 * Anything the framework, the admin, authentication, uploads or a crawler owns
 * belongs here. A market whose slug collided with one of these would shadow a
 * system route, so `isReservedSegment` is also what the country form validates
 * a new slug against.
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  '_next',
  '_vercel',
  'auth',
  // The sign-in screen lives under its own segment; read from the one module
  // that defines it so moving the screen cannot leave a stale entry here.
  LOGIN_PATH_SEGMENT,
  'login',
  'logout',
  'preview',
  'uploads',
  'media',
  'static',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  // The per-market sitemap files live under /sitemaps/<prefix>.xml.
  'sitemaps',
  'manifest.json',
  'health',
  'ready',
  'opensearch.xml',
  'sw.js',
]);

export function isReservedSegment(segment: string): boolean {
  const value = segment.trim().toLowerCase();
  if (!value) return false;
  // Any dotted first segment is a file, never a market.
  return RESERVED_SEGMENTS.has(value) || value.includes('.');
}

/**
 * Prefixes a market may not claim.
 *
 * A wider set than `RESERVED_SEGMENTS`, and deliberately not the same question.
 * `RESERVED_SEGMENTS` answers "is this URL a system path that must never be
 * market-prefixed?" — `/admin` is, `/products/dropbox-business` is not, because
 * a product page genuinely lives at `/ae/products/...`.
 *
 * This answers "may a market's prefix be this word?", and there `blog` and
 * `products` must be refused: both are literal segments in the app router, and
 * Next matches a literal route before a catch-all, so a market called
 * `products` would simply never resolve. Putting them in the routing set
 * instead would stop every product link being prefixed at all.
 */
const RESERVED_COUNTRY_PREFIXES: ReadonlySet<string> = new Set([
  ...RESERVED_SEGMENTS,
  'blog',
  'products',
]);

/**
 * The blog lives at the site root only.
 *
 * Articles are written once and are not per-market: there is one `/blog`, one
 * set of categories and one set of tags, and every market links to them. So a
 * blog path is never given a market prefix — `/ae/blog/x` would be a second URL
 * for the same article, which is duplicate content that splits its own ranking.
 *
 * This is the single test for "is this a blog URL", used by link generation,
 * by the redirect that retires the prefixed copies, and by the sitemaps.
 */
export function isBlogPath(path: string): boolean {
  return pathSegments(path)[0] === 'blog';
}

export function isReservedCountryPrefix(prefix: string): boolean {
  const value = prefix.trim().toLowerCase();
  if (!value) return false;
  return RESERVED_COUNTRY_PREFIXES.has(value) || value.includes('.');
}

/** Splits a pathname into clean, decoded segments. */
export function pathSegments(pathname: string): string[] {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '';
  return withoutQuery
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** Normalises a content path to the app's convention: leading slash, no trailing slash. */
export function normalisePath(path: string): string {
  const segments = pathSegments(path);
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

/**
 * The public URL of `path` within `country`.
 *
 * ```
 * countryPath(india, 'dropbox-business') === '/dropbox-business'
 * countryPath(uae,   'dropbox-business') === '/ae/dropbox-business'
 * countryPath(qatar, 'dropbox-business') === '/qa/dropbox-business'
 * countryPath(uae,   '')                 === '/ae'
 * ```
 *
 * This is the only place a market prefix is ever written. Nothing else in the
 * codebase concatenates one.
 */
export function countryPath(country: Pick<CountryContext, 'slug'>, path = ''): string {
  const rest = pathSegments(path);
  const prefix = country.slug.trim().replace(/^\/+|\/+$/g, '');
  const all = prefix ? [prefix, ...rest] : rest;
  return all.length > 0 ? `/${all.join('/')}` : '/';
}

/**
 * Hostnames that are this site itself.
 *
 * Read from `NEXT_PUBLIC_SITE_URL`, which is the same value the canonical URLs
 * and sitemaps are built from and which production refuses to boot without —
 * so it is the site's real domain, not a guess. `NEXT_PUBLIC_` is inlined at
 * build time, so this works in the browser too and costs no request-time work.
 *
 * `www.` is folded away: a site served at both spellings is one site, and an
 * editor who pasted the other one did not mean a different destination.
 *
 * The admin-editable `WebsiteSettings.siteUrl` is deliberately *not* consulted.
 * It defaults to `http://localhost:3000` and nothing forces it to be right, so
 * treating it as an identity would let a stale or mistaken value start
 * rewriting links to a domain that genuinely is somebody else's.
 */
function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '');
}

function ownHosts(): string[] {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return [];
  try {
    return [normaliseHost(new URL(configured).host)];
  } catch {
    return [];
  }
}

/**
 * The path inside `value` when `value` is an absolute URL pointing at this very
 * site, or null when it points anywhere else.
 *
 * This is what closes the gap that made every market's menu lead back to the
 * root market. An editor who types `/pricing` gets a link that follows them
 * into the UAE; one who pastes `https://oursite.com/pricing` — which the menu
 * editor stores as an External URL, and which the country sync then copies
 * verbatim into every new market — got a link that walked them out of it. The
 * two are the same destination written two ways, so they resolve the same way.
 *
 * A URL on any other host is left alone: rewriting a genuinely external link
 * would send visitors somewhere the editor never chose.
 */
export function ownHostPath(value: string, hosts: readonly string[] = ownHosts()): string | null {
  if (hosts.length === 0) return null;
  let parsed: URL;
  try {
    /*
     * The base only exists so a protocol-relative `//host/path` can be parsed;
     * it never supplies the host, because any value reaching here carries its
     * own. A value that does not — a bare `pricing` — resolves to the base's
     * host, which is not a real one and so matches nothing.
     */
    parsed = new URL(value, 'https://not-a-real-host.invalid');
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!hosts.includes(normaliseHost(parsed.host))) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Rewrites an internal link so it stays inside `country`.
 *
 * Left untouched: URLs on other hosts, anchors, query-only links,
 * `mailto:`/`tel:`, system routes, and any path that already carries a market
 * prefix. Everything else — the root-relative links an editor types into a CTA,
 * and absolute URLs that point back at this same site — gains the current
 * market's prefix.
 *
 * For the default market this is the identity function, which is why the root
 * market's rendered HTML is unchanged by the multi-market conversion.
 */
export function countryHref(
  country: CountryContext,
  href: string | null | undefined,
  hosts: readonly string[] = ownHosts(),
): string {
  if (!href) return href ?? '';
  const value = href.trim();
  if (!value) return href;
  if (country.isDefault || !country.slug) return href;

  // Not a root-relative path: an anchor, a query, mailto/tel, or a URL with a
  // host. Only the last of those can still be ours, and only then by its host.
  let candidate = value;
  if (!value.startsWith('/') || value.startsWith('//')) {
    const own = ownHostPath(value, hosts);
    if (own === null) return href;
    candidate = own;
  }

  const [pathPart = '', ...restParts] = candidate.split(/(?=[?#])/);
  const suffix = restParts.join('');
  const segments = pathSegments(pathPart);
  const first = segments[0];

  if (first && isReservedSegment(first)) return href;
  /*
   * The blog is root-only, so a link to it stays root-relative in every
   * market. Prefixing it would produce a URL that only exists to redirect
   * back here — and a country navigation linking to `/blog` is exactly what
   * is wanted.
   */
  if (first === 'blog') return href;
  // Already addressed to a market — the editor meant that market.
  if (first && (first === country.slug || country.prefixes.includes(first))) return href;

  const localised = countryPath(country, segments.join('/'));
  return `${localised}${suffix}`;
}

/**
 * Splits a public pathname into the market that owns it and the path within
 * that market.
 *
 * `countries` is the full configured list. Only active, non-default markets can
 * claim a prefix, so deactivating a market immediately stops its prefix
 * behaving like a storefront — `/qa/anything` then resolves in the default
 * market, where it will simply not be found.
 */
export function splitCountryPath(
  pathname: string,
  countries: readonly CountryContext[],
): { country: CountryContext | null; path: string; matchedPrefix: boolean } {
  const segments = pathSegments(pathname);
  const fallback = countries.find((c) => c.isDefault) ?? countries[0] ?? null;
  const first = segments[0];

  if (first && !isReservedSegment(first)) {
    const match = countries.find(
      (candidate) => candidate.slug !== '' && candidate.slug === first && candidate.isActive,
    );
    if (match) {
      return { country: match, path: normalisePath(segments.slice(1).join('/')), matchedPrefix: true };
    }
  }

  return { country: fallback, path: normalisePath(segments.join('/')), matchedPrefix: false };
}

/**
 * The content slug for a path: no leading slash, no trailing slash.
 * `""` is the homepage, matching `Page.slug`.
 */
export function contentSlug(path: string): string {
  return pathSegments(path).join('/');
}

/**
 * Deep-rewrites the internal links inside a stored CMS payload.
 *
 * Editors type plain paths (`/contact`, `/products/dropbox-business`) into
 * block content, and those paths must resolve inside the market the block is
 * rendered in. Rewriting here — once, at the render boundary — keeps every
 * block component free of market logic.
 *
 * For the default market the payload is returned by reference and nothing is
 * walked at all, so the root market's rendering path is completely unchanged.
 * System routes and already-prefixed links are left alone by `countryHref`.
 */
export function localiseContent<T>(
  content: T,
  country: CountryContext,
  hosts: readonly string[] = ownHosts(),
): T {
  if (country.isDefault || !country.slug) return content;
  // Resolved once for the whole payload rather than per string.
  return walk(content, country, hosts) as T;
}

/**
 * Whether a string is worth parsing as a URL with a host.
 *
 * A cheap guard in front of `ownHostPath`, which has to construct a `URL`.
 * Block payloads are mostly prose, and headings and body copy should not each
 * pay for a parse that can only ever fail.
 */
function looksAbsolute(value: string): boolean {
  return value.startsWith('//') || value.includes('://');
}

/**
 * Rewrites the root-relative `href`/`src` attributes inside a fragment of
 * editor HTML so they resolve inside `country`.
 *
 * Rich text is the one place an internal link is not a field of its own, so it
 * gets the same treatment the structured fields get — and the same exemptions,
 * because every candidate still goes through `countryHref`.
 */
export function localiseHtml(
  html: string,
  country: CountryContext,
  hosts: readonly string[] = ownHosts(),
): string {
  if (country.isDefault || !country.slug) return html;
  if (!html.includes('/')) return html;
  /*
   * Every `href`/`src` is offered, not just the root-relative ones, because an
   * editor's link to this same site is just as internal written out in full.
   * `countryHref` is still the only thing that decides: a URL on another host,
   * a `mailto:` or a system route comes back exactly as it was.
   */
  return html.replace(
    /\b(href|src)=("|')([^"']*)\2/gi,
    (match, attribute: string, quote: string, url: string) =>
      `${attribute}=${quote}${countryHref(country, url, hosts)}${quote}`,
  );
}

function walk(value: unknown, country: CountryContext, hosts: readonly string[]): unknown {
  if (typeof value === 'string') {
    // A root-relative path is localised directly.
    if (value.startsWith('/')) return countryHref(country, value, hosts);
    // Prose, which may still carry markup links.
    if (value.includes('<')) return localiseHtml(value, country, hosts);
    /*
     * A bare absolute URL in a field of its own — a CTA's `ctaUrl`, a card's
     * link. When it points back at this site it is an internal link written
     * the long way, and has to follow the visitor into their market like any
     * other; `countryHref` returns anything else untouched.
     */
    if (looksAbsolute(value)) return countryHref(country, value, hosts);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => walk(item, country, hosts));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(item, country, hosts);
    }
    return out;
  }
  return value;
}
