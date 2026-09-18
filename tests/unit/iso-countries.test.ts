import { describe, it, expect } from 'vitest';
import {
  ISO_COUNTRIES,
  isoCountry,
  searchCountries,
  suggestedSlug,
  suggestedLocale,
} from '@/lib/country/iso';
import { isReservedCountryPrefix, isReservedSegment } from '@/lib/country/routing';
import { countrySlugSchema } from '@/lib/validation/country';

describe('ISO 3166-1 list', () => {
  it('carries all 249 officially assigned alpha-2 codes, each exactly once', () => {
    expect(ISO_COUNTRIES).toHaveLength(249);
    expect(new Set(ISO_COUNTRIES.map((c) => c.code)).size).toBe(249);
  });

  it('holds the two markets this site already runs', () => {
    expect(isoCountry('IN')).toMatchObject({ name: 'India', currency: 'INR' });
    expect(isoCountry('AE')).toMatchObject({ name: 'United Arab Emirates', currency: 'AED' });
  });

  it('is case-insensitive on lookup and rejects a non-country', () => {
    expect(isoCountry('in')?.code).toBe('IN');
    expect(isoCountry('ZZ')).toBeNull();
    expect(isoCountry('UK')).toBeNull(); // the code for the UK is GB
  });

  it('finds a country by name or by code, ranking exact hits first', () => {
    expect(searchCountries('QA')[0]?.code).toBe('QA');
    expect(searchCountries('united arab')[0]?.code).toBe('AE');
    expect(searchCountries('king')[0]?.code).toBe('GB');
    expect(searchCountries('zzzz')).toHaveLength(0);
  });

  it('suggests a prefix and locale that are editable starting points', () => {
    expect(suggestedSlug('QA')).toBe('qa');
    // English, because the site's content is English — ICU would say ar-QA.
    expect(suggestedLocale('QA')).toBe('en-QA');
  });
});

describe('route conflicts', () => {
  it('refuses a prefix that would shadow an application route', () => {
    for (const prefix of ['admin', 'api', 'auth', 'preview', 'media', 'uploads']) {
      expect(isReservedCountryPrefix(prefix), prefix).toBe(true);
      expect(countrySlugSchema.safeParse(prefix).success, prefix).toBe(false);
    }
  });

  it('refuses blog and products, which are literal routes a market would lose to', () => {
    // Next matches a literal route before a catch-all, so a market called
    // "products" would never resolve at all.
    for (const prefix of ['blog', 'products']) {
      expect(isReservedCountryPrefix(prefix), prefix).toBe(true);
      expect(countrySlugSchema.safeParse(prefix).success, prefix).toBe(false);
    }
  });

  it('still prefixes product and blog links inside a market', () => {
    // The routing set is the other question: /ae/products/x is real content,
    // so these must NOT be treated as system paths.
    expect(isReservedSegment('products')).toBe(false);
    expect(isReservedSegment('blog')).toBe(false);
    expect(isReservedSegment('admin')).toBe(true);
  });

  it('accepts an ordinary prefix, and normalises it', () => {
    expect(countrySlugSchema.parse('  /QA/ ')).toBe('qa');
    expect(countrySlugSchema.parse('')).toBe('');
    expect(countrySlugSchema.safeParse('not a slug').success).toBe(false);
    expect(countrySlugSchema.safeParse('robots.txt').success).toBe(false);
  });
});
