import { describe, it, expect } from 'vitest';
import { countryHref, countryPath, isBlogPath } from '@/lib/country/routing';
import { testCountryContext } from '../helpers';

const india = testCountryContext({ id: 'in', code: 'IN', slug: '', isDefault: true });
const uae = testCountryContext({
  id: 'ae',
  name: 'United Arab Emirates',
  code: 'AE',
  slug: 'ae',
  isDefault: false,
});

describe('the blog is root-only', () => {
  it('recognises a blog path in every shape it takes', () => {
    expect(isBlogPath('/blog')).toBe(true);
    expect(isBlogPath('/blog/some-article')).toBe(true);
    expect(isBlogPath('/blog/category/guides')).toBe(true);
    expect(isBlogPath('/blog/tag/migration')).toBe(true);
    expect(isBlogPath('/blogging-tips')).toBe(false);
    expect(isBlogPath('/products/blog')).toBe(false);
  });

  it('never prefixes a blog link, whichever market is being rendered', () => {
    // A country navigation linking to the blog must point at the root URL —
    // not at a prefixed one that only exists to redirect back.
    for (const href of ['/blog', '/blog/some-article', '/blog/category/guides']) {
      expect(countryHref(uae, href), href).toBe(href);
      expect(countryHref(india, href), href).toBe(href);
    }
  });

  it('still prefixes everything that genuinely is per-market', () => {
    expect(countryHref(uae, '/contact')).toBe('/ae/contact');
    expect(countryHref(uae, '/products/dropbox-business')).toBe('/ae/products/dropbox-business');
    expect(countryHref(uae, '/pricing')).toBe('/ae/pricing');
  });

  it('leaves the root market identical, as it always was', () => {
    expect(countryHref(india, '/contact')).toBe('/contact');
    expect(countryPath(india, 'blog')).toBe('/blog');
  });
});
