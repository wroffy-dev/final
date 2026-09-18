import { describe, it, expect } from 'vitest';
import {
  countryPath,
  countryHref,
  splitCountryPath,
  contentSlug,
  normalisePath,
  isReservedSegment,
  localiseContent,
  localiseHtml,
  RESERVED_SEGMENTS,
} from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';

/**
 * The routing engine decides which market owns a URL and what a link looks like
 * inside it. Two properties matter most and are asserted directly: the root
 * market's URLs never change, and a system route is never mistaken for a
 * market.
 */

const base: Omit<CountryContext, 'id' | 'name' | 'code' | 'slug' | 'locale' | 'isDefault'> = {
  currency: 'INR',
  currencySymbol: '₹',
  phoneCode: null,
  timezone: 'UTC',
  isActive: true,
  isPublished: true,
  sortOrder: 0,
  prefixes: ['ae', 'qa'],
};

const india: CountryContext = {
  ...base,
  id: 'c-in',
  name: 'India',
  code: 'IN',
  slug: '',
  locale: 'en-IN',
  isDefault: true,
};

const uae: CountryContext = {
  ...base,
  id: 'c-ae',
  name: 'United Arab Emirates',
  code: 'AE',
  slug: 'ae',
  locale: 'en-AE',
  isDefault: false,
  currency: 'AED',
};

/** A market that was added without touching a line of routing code. */
const qatar: CountryContext = {
  ...base,
  id: 'c-qa',
  name: 'Qatar',
  code: 'QA',
  slug: 'qa',
  locale: 'en-QA',
  isDefault: false,
  currency: 'QAR',
};

const inactive: CountryContext = { ...qatar, id: 'c-om', code: 'OM', slug: 'om', isActive: false };

describe('countryPath', () => {
  it('leaves the root market unprefixed', () => {
    expect(countryPath(india, 'dropbox-business')).toBe('/dropbox-business');
    expect(countryPath(india, '')).toBe('/');
    expect(countryPath(india, 'blog/guide')).toBe('/blog/guide');
  });

  it('prefixes every other market', () => {
    expect(countryPath(uae, 'dropbox-business')).toBe('/ae/dropbox-business');
    expect(countryPath(uae, '')).toBe('/ae');
    expect(countryPath(uae, 'blog/category/dropbox')).toBe('/ae/blog/category/dropbox');
  });

  it('works for a market the code has never heard of', () => {
    expect(countryPath(qatar, 'dropbox-business')).toBe('/qa/dropbox-business');
  });

  it('normalises stray slashes rather than emitting them', () => {
    expect(countryPath(uae, '/contact/')).toBe('/ae/contact');
    expect(countryPath(india, '//pricing//')).toBe('/pricing');
  });
});

describe('countryHref', () => {
  it('is the identity function for the root market', () => {
    for (const href of ['/contact', '/products/x', 'https://x.test', '#anchor', 'mailto:a@b.test']) {
      expect(countryHref(india, href)).toBe(href);
    }
  });

  it('prefixes internal paths for a prefixed market', () => {
    expect(countryHref(uae, '/contact')).toBe('/ae/contact');
    expect(countryHref(uae, '/products/dropbox-business')).toBe('/ae/products/dropbox-business');
  });

  it('preserves query strings and fragments', () => {
    expect(countryHref(uae, '/pricing?plan=business#compare')).toBe(
      '/ae/pricing?plan=business#compare',
    );
  });

  it('leaves anything that is not an internal path alone', () => {
    expect(countryHref(uae, 'https://dropbox.com')).toBe('https://dropbox.com');
    expect(countryHref(uae, '//cdn.example.test/x.png')).toBe('//cdn.example.test/x.png');
    expect(countryHref(uae, '#faq')).toBe('#faq');
    expect(countryHref(uae, '?page=2')).toBe('?page=2');
    expect(countryHref(uae, 'tel:+97140000000')).toBe('tel:+97140000000');
    expect(countryHref(uae, '')).toBe('');
  });

  it('never captures a system route', () => {
    expect(countryHref(uae, '/admin/pages')).toBe('/admin/pages');
    expect(countryHref(uae, '/api/health')).toBe('/api/health');
    expect(countryHref(uae, '/uploads/2026/01/logo.png')).toBe('/uploads/2026/01/logo.png');
    expect(countryHref(uae, '/auth-control-panel/admin')).toBe('/auth-control-panel/admin');
    expect(countryHref(uae, '/favicon.ico')).toBe('/favicon.ico');
  });

  it('does not double a prefix an editor already wrote', () => {
    expect(countryHref(uae, '/ae/contact')).toBe('/ae/contact');
    // Another market's prefix is deliberate too, so it is left as written.
    expect(countryHref(uae, '/qa/contact')).toBe('/qa/contact');
  });
});

describe('splitCountryPath', () => {
  const countries = [india, uae, qatar, inactive];

  it('gives an unprefixed path to the root market', () => {
    expect(splitCountryPath('/dropbox-business', countries)).toEqual({
      country: india,
      path: '/dropbox-business',
      matchedPrefix: false,
    });
  });

  it('gives a prefixed path to its market, with the prefix stripped', () => {
    expect(splitCountryPath('/ae/dropbox-business', countries)).toEqual({
      country: uae,
      path: '/dropbox-business',
      matchedPrefix: true,
    });
    expect(splitCountryPath('/ae', countries)).toEqual({
      country: uae,
      path: '/',
      matchedPrefix: true,
    });
  });

  it('routes a new market without any code change', () => {
    const result = splitCountryPath('/qa/blog/guide', countries);
    expect(result.country).toBe(qatar);
    expect(result.path).toBe('/blog/guide');
  });

  it('does not treat an inactive market as a storefront', () => {
    const result = splitCountryPath('/om/anything', countries);
    expect(result.country).toBe(india);
    // The prefix stays in the path, so it resolves to nothing and 404s.
    expect(result.path).toBe('/om/anything');
  });

  it('never captures a system route', () => {
    for (const path of [
      '/admin',
      '/api/health',
      '/auth-control-panel/admin',
      '/uploads/x.png',
      '/robots.txt',
    ]) {
      const result = splitCountryPath(path, countries);
      expect(result.matchedPrefix).toBe(false);
      expect(result.country).toBe(india);
    }
  });

  it('falls back to the root market for an unknown prefix', () => {
    const result = splitCountryPath('/zz/pricing', countries);
    expect(result.country).toBe(india);
    expect(result.path).toBe('/zz/pricing');
  });

  it('resolves the site root', () => {
    expect(splitCountryPath('/', countries).path).toBe('/');
    expect(splitCountryPath('', countries).country).toBe(india);
  });
});

describe('reserved segments', () => {
  it('covers the application surfaces a market must never shadow', () => {
    for (const segment of [
      'admin',
      'api',
      '_next',
      'auth',
      // The sign-in screen's own segment: a market slug that shadowed it would
      // take the admin offline.
      'auth-control-panel',
      'login',
      'preview',
      'uploads',
    ]) {
      expect(RESERVED_SEGMENTS.has(segment)).toBe(true);
    }
  });

  it('treats any dotted segment as a file', () => {
    expect(isReservedSegment('sitemap.xml')).toBe(true);
    expect(isReservedSegment('anything.txt')).toBe(true);
    expect(isReservedSegment('ae')).toBe(false);
  });
});

describe('path helpers', () => {
  it('normalises to a leading slash and no trailing slash', () => {
    expect(normalisePath('/a/b/')).toBe('/a/b');
    expect(normalisePath('')).toBe('/');
  });

  it('produces the slug the Page model stores', () => {
    expect(contentSlug('/dropbox/business')).toBe('dropbox/business');
    expect(contentSlug('/')).toBe('');
  });
});

describe('localiseContent', () => {
  it('returns the payload untouched for the root market', () => {
    const content = { ctaUrl: '/contact', items: [{ url: '/pricing' }] };
    expect(localiseContent(content, india)).toBe(content);
  });

  it('rewrites internal links anywhere in a stored payload', () => {
    const content = {
      heading: 'Plans',
      ctaUrl: '/contact',
      items: [{ url: '/pricing' }, { url: 'https://dropbox.com' }],
      nested: { deep: { href: '/products/business' } },
    };
    expect(localiseContent(content, uae)).toEqual({
      heading: 'Plans',
      ctaUrl: '/ae/contact',
      items: [{ url: '/ae/pricing' }, { url: 'https://dropbox.com' }],
      nested: { deep: { href: '/ae/products/business' } },
    });
  });

  it('leaves media and system paths alone', () => {
    expect(localiseContent({ src: '/uploads/2026/01/hero.png' }, uae)).toEqual({
      src: '/uploads/2026/01/hero.png',
    });
  });

  it('does not rewrite prose that merely mentions a path', () => {
    expect(localiseContent({ body: 'Visit us at our office' }, uae)).toEqual({
      body: 'Visit us at our office',
    });
  });

  it('rewrites links inside rich text', () => {
    const html = '<p>See <a href="/pricing">pricing</a> and <a href="https://x.test">x</a>.</p>';
    expect(localiseContent({ body: html }, uae)).toEqual({
      body: '<p>See <a href="/ae/pricing">pricing</a> and <a href="https://x.test">x</a>.</p>',
    });
  });

  it('preserves numbers, booleans and nulls', () => {
    const content = { limit: 3, paginate: true, categoryId: null };
    expect(localiseContent(content, uae)).toEqual(content);
  });
});

describe('localiseHtml', () => {
  it('rewrites href and src attributes, in either quote style', () => {
    expect(localiseHtml(`<a href='/contact'>x</a>`, uae)).toBe(`<a href='/ae/contact'>x</a>`);
    expect(localiseHtml('<img src="/assets/hero.png">', uae)).toBe(
      // /assets is reserved, so an asset path is never rewritten into a market.
      '<img src="/assets/hero.png">',
    );
    expect(localiseHtml('<img src="/uploads/2026/01/hero.png">', uae)).toBe(
      '<img src="/uploads/2026/01/hero.png">',
    );
    // The blog is root-only: an editor's link to an article stays pointing at
    // the one URL that article has, in every market. Prefixing it would make
    // a second URL whose only purpose is to redirect back here.
    expect(localiseHtml('<a href="/blog/guide">g</a>', uae)).toBe(
      '<a href="/blog/guide">g</a>',
    );
  });

  it('leaves the root market markup exactly as written', () => {
    const html = '<a href="/contact">x</a>';
    expect(localiseHtml(html, india)).toBe(html);
  });
});
