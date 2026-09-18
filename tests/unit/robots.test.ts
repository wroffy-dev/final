import { describe, it, expect } from 'vitest';
import { compileRobots, type CountryRobots } from '@/lib/seo/robots';

const market = (over: Partial<CountryRobots> = {}): CountryRobots => ({
  slug: 'ae',
  name: 'United Arab Emirates',
  isActive: true,
  isPublished: true,
  disallow: null,
  allow: null,
  noIndexCountry: false,
  excludeFromSitemap: false,
  ...over,
});

const root = (over: Partial<CountryRobots> = {}) =>
  market({ slug: '', name: 'India', ...over });

const compile = (over: Partial<Parameters<typeof compileRobots>[0]> = {}) =>
  compileRobots({
    baseUrl: 'https://example.com',
    noIndexSite: false,
    sitemapEnabled: true,
    extra: null,
    countries: [root(), market()],
    ...over,
  });

describe('robots.txt', () => {
  it('always protects the application paths and points at the sitemap', () => {
    const { body } = compile();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /api/');
    // Absolute, as the protocol requires — a relative reference is ignored.
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('never publishes the sign-in path', () => {
    // robots.txt is public. Listing the admin sign-in URL would advertise the
    // one thing moving it off /login was meant to keep quiet.
    const { body } = compile();
    expect(body).not.toContain('auth-control-panel');
  });

  it('compiles a market rule with that market prefix', () => {
    const { body } = compile({
      countries: [root(), market({ disallow: '/thanks\n/internal' })],
    });
    expect(body).toContain('Disallow: /ae/thanks');
    expect(body).toContain('Disallow: /ae/internal');
    // The root market is served from /, so its rules keep their own paths.
    const { body: rootBody } = compile({ countries: [root({ disallow: '/thanks' })] });
    expect(rootBody).toContain('Disallow: /thanks');
  });

  it('refuses a rule that would block the entire site', () => {
    const { body, warnings } = compile({ extra: '/' });
    expect(body).not.toMatch(/^Disallow: \/$/m);
    expect(warnings.some((w) => w.level === 'error' && /whole site/i.test(w.message))).toBe(true);
  });

  it('refuses a rule that would block the assets pages need to render', () => {
    for (const path of ['/_next/static', '/_next/', '/media', '/uploads']) {
      const { body, warnings } = compile({ extra: path });
      expect(body, path).not.toContain(`Disallow: ${path}`);
      expect(warnings.some((w) => w.level === 'error'), path).toBe(true);
    }
  });

  it('warns rather than blocking when a market is set to noindex', () => {
    // Blocking the crawl would stop it ever reading the noindex.
    const { body, warnings } = compile({
      countries: [root(), market({ noIndexCountry: true })],
    });
    expect(body).not.toContain('Disallow: /ae');
    expect(
      warnings.some((w) => /never fetched and its noindex is never read/i.test(w.message)),
    ).toBe(true);
  });

  it('honours the whole-site switch, and says so in the file', () => {
    const { body, warnings } = compile({ noIndexSite: true });
    expect(body).toMatch(/^Disallow: \/$/m);
    expect(body).toContain('Admin → SEO');
    expect(warnings.some((w) => w.level === 'error')).toBe(true);
  });

  it('notices when every market has been blocked one at a time', () => {
    const { warnings } = compile({
      countries: [market({ slug: 'ae', disallow: '/' }), market({ slug: 'qa', name: 'Qatar', disallow: '/' })],
    });
    expect(
      warnings.some((w) => w.level === 'error' && /Every market is blocked/.test(w.message)),
    ).toBe(true);
  });

  it('ignores an inactive market entirely', () => {
    const { body } = compile({
      countries: [root(), market({ isActive: false, disallow: '/secret' })],
    });
    expect(body).not.toContain('/ae/secret');
  });

  it('tolerates a pasted "Disallow:" prefix and un-rooted paths', () => {
    const { body } = compile({ extra: 'Disallow: /one\ntwo' });
    expect(body).toContain('Disallow: /one');
    expect(body).toContain('Disallow: /two');
  });
});
