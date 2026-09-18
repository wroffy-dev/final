import { describe, it, expect } from 'vitest';
import { countryHref, localiseContent, localiseHtml, ownHostPath } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';

/**
 * A link to this same site, written out in full, is still an internal link.
 *
 * This is the bug every market's header had. The menu editor stores a pasted
 * URL as an "External URL", the country sync copies it verbatim into each new
 * market, and nothing localised it — so a UAE visitor clicking the UAE menu was
 * sent back to the root market. `/pricing` and `https://oursite.test/pricing`
 * name the same destination, so they now resolve the same way.
 *
 * The hosts are passed explicitly rather than read from the environment, so
 * these assertions do not depend on how the suite happens to be configured.
 */

const HOSTS = ['oursite.test'];

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
};

describe('ownHostPath', () => {
  it('extracts the path from a URL on this site, keeping query and hash', () => {
    expect(ownHostPath('https://oursite.test/pricing', HOSTS)).toBe('/pricing');
    expect(ownHostPath('http://oursite.test/a/b?x=1#c', HOSTS)).toBe('/a/b?x=1#c');
    // One site served at two spellings is one site.
    expect(ownHostPath('https://www.oursite.test/pricing', HOSTS)).toBe('/pricing');
    // Protocol-relative, which is still a URL with a host.
    expect(ownHostPath('//oursite.test/pricing', HOSTS)).toBe('/pricing');
  });

  it('refuses anything that is not this site', () => {
    expect(ownHostPath('https://dropbox.com/pricing', HOSTS)).toBeNull();
    expect(ownHostPath('//cdn.example.test/x.png', HOSTS)).toBeNull();
    expect(ownHostPath('mailto:sales@oursite.test', HOSTS)).toBeNull();
    expect(ownHostPath('tel:+919797970004', HOSTS)).toBeNull();
    expect(ownHostPath('javascript:alert(1)', HOSTS)).toBeNull();
    // A bare word must not be read as a path on our host.
    expect(ownHostPath('pricing', HOSTS)).toBeNull();
    // With nothing configured, nothing is ours.
    expect(ownHostPath('https://oursite.test/pricing', [])).toBeNull();
  });
});

describe('a menu link written as a full URL follows the visitor', () => {
  it('localises a URL on this site, exactly as the path form is localised', () => {
    expect(countryHref(uae, 'https://oursite.test/pricing', HOSTS)).toBe('/ae/pricing');
    expect(countryHref(uae, '/pricing', HOSTS)).toBe('/ae/pricing');
    expect(countryHref(uae, 'https://www.oursite.test/contact', HOSTS)).toBe('/ae/contact');
    expect(countryHref(uae, 'https://oursite.test/pricing?plan=biz#x', HOSTS)).toBe(
      '/ae/pricing?plan=biz#x',
    );
  });

  it('still leaves a genuinely external link alone', () => {
    for (const href of [
      'https://dropbox.com/pricing',
      '//cdn.example.test/x.png',
      'mailto:sales@oursite.test',
      'tel:+919797970004',
      '#features',
      '?page=2',
    ]) {
      expect(countryHref(uae, href, HOSTS)).toBe(href);
    }
  });

  it('does not prefix our own URL when its path must not be prefixed', () => {
    // System routes and the root-only blog keep the destination they name.
    expect(countryHref(uae, 'https://oursite.test/admin', HOSTS)).toBe(
      'https://oursite.test/admin',
    );
    expect(countryHref(uae, 'https://oursite.test/blog/guide', HOSTS)).toBe(
      'https://oursite.test/blog/guide',
    );
    expect(countryHref(uae, 'https://oursite.test/uploads/hero.png', HOSTS)).toBe(
      'https://oursite.test/uploads/hero.png',
    );
    // Already addressed to this market.
    expect(countryHref(uae, 'https://oursite.test/ae/pricing', HOSTS)).toBe(
      'https://oursite.test/ae/pricing',
    );
  });

  it('leaves the root market untouched, as it always has', () => {
    const href = 'https://oursite.test/pricing';
    expect(countryHref(india, href, HOSTS)).toBe(href);
    expect(countryHref(india, '/pricing', HOSTS)).toBe('/pricing');
  });
});

describe('the same rule reaches block content and rich text', () => {
  it('localises a full URL sitting in a field of its own', () => {
    const content = {
      heading: 'Compare the plans',
      ctaUrl: 'https://oursite.test/pricing',
      secondaryCtaUrl: 'https://dropbox.com/pricing',
      relative: '/contact',
    };

    const localised = localiseContent(content, uae, HOSTS) as typeof content;
    expect(localised.ctaUrl).toBe('/ae/pricing');
    expect(localised.secondaryCtaUrl).toBe('https://dropbox.com/pricing');
    expect(localised.relative).toBe('/ae/contact');
    // Prose is not a URL and must survive untouched.
    expect(localised.heading).toBe('Compare the plans');
  });

  it('localises a full URL inside editor markup', () => {
    expect(localiseHtml('<a href="https://oursite.test/contact">x</a>', uae, HOSTS)).toBe(
      '<a href="/ae/contact">x</a>',
    );
    // An external link in the same fragment is left as written.
    expect(localiseHtml('<a href="https://dropbox.com/x">x</a>', uae, HOSTS)).toBe(
      '<a href="https://dropbox.com/x">x</a>',
    );
    // An image served from our own domain must not be prefixed into a 404.
    expect(localiseHtml('<img src="https://oursite.test/uploads/a.png">', uae, HOSTS)).toBe(
      '<img src="https://oursite.test/uploads/a.png">',
    );
    // mailto in markup stays a mailto.
    expect(localiseHtml('<a href="mailto:a@oursite.test">m</a>', uae, HOSTS)).toBe(
      '<a href="mailto:a@oursite.test">m</a>',
    );
  });
});
