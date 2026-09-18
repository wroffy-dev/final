import { describe, it, expect } from 'vitest';
import { slugify, pageSlug, uniqueSlug } from '@/lib/utils/slug';

describe('slugify', () => {
  it('lowercases and strips punctuation', () => {
    expect(slugify('Dropbox Business Advanced!')).toBe('dropbox-business-advanced');
  });
});

describe('pageSlug', () => {
  it('returns an empty slug for the homepage', () => {
    expect(pageSlug('/')).toBe('');
    expect(pageSlug('')).toBe('');
  });

  it('preserves nesting but slugifies each segment', () => {
    expect(pageSlug('/Dropbox/Business Plans/')).toBe('dropbox/business-plans');
  });

  it('drops empty segments', () => {
    expect(pageSlug('a//b')).toBe('a/b');
  });
});

describe('uniqueSlug', () => {
  it('appends a counter until the slug is free', async () => {
    const taken = new Set(['pricing', 'pricing-2']);
    expect(await uniqueSlug('pricing', async (c) => taken.has(c))).toBe('pricing-3');
  });

  it('returns the base slug when it is free', async () => {
    expect(await uniqueSlug('about', async () => false)).toBe('about');
  });
});
