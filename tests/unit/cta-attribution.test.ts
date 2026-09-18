import { describe, it, expect } from 'vitest';
import { BLOCKS, parseBlockContent } from '@/lib/cms/blocks';

/**
 * Internal CTA attribution names *where on the site* a form sits. It is a
 * separate field from utm_source on purpose: mixing the two would make an
 * internal placement look like an external campaign in every report.
 */
const FORM_BEARING = ['hero', 'cta', 'leadMagnet', 'formBlock'] as const;

describe('internal CTA attribution', () => {
  it('is offered on every block that can host a form', () => {
    for (const type of FORM_BEARING) {
      const block = BLOCKS[type];
      expect(block, `${type} should exist`).toBeTruthy();

      const field = block.fields.find((candidate) => candidate.name === 'ctaLocation');
      expect(field, `${type} should offer a tracking label`).toBeTruthy();
      expect(field!.kind).toBe('text');
    }
  });

  it('defaults to empty so existing sections keep the label they already report', () => {
    for (const type of FORM_BEARING) {
      const parsed = parseBlockContent(type, {}) as Record<string, unknown>;
      expect(parsed.ctaLocation).toBe('');
    }
  });

  it('accepts an admin-supplied label and bounds its length', () => {
    const parsed = parseBlockContent('hero', { ctaLocation: 'homepage_hero' }) as Record<
      string,
      unknown
    >;
    expect(parsed.ctaLocation).toBe('homepage_hero');

    // A too-long value is rejected rather than stored and later truncated by
    // the database.
    const long = parseBlockContent('hero', { ctaLocation: 'x'.repeat(500) }) as Record<
      string,
      unknown
    >;
    expect(String(long.ctaLocation).length).toBeLessThanOrEqual(120);
  });

  it('is not the same field as the external campaign source', () => {
    // Nothing in a block schema should let an admin set utm_source directly:
    // that belongs to the visitor's arrival, not to the page they land on.
    for (const block of Object.values(BLOCKS)) {
      for (const field of block.fields) {
        expect(field.name).not.toMatch(/^utm/i);
      }
    }
  });
});

describe('hero layouts', () => {
  it('offers every layout the renderer supports', () => {
    const layout = BLOCKS.hero.fields.find((field) => field.name === 'layout');
    expect(layout).toBeTruthy();
    expect(layout!.kind).toBe('select');

    const values = (layout as { options: Array<{ value: string }> }).options.map(
      (option) => option.value,
    );
    expect(values).toEqual([
      'content',
      'contentImage',
      'contentForm',
      'contentImageForm',
      'backgroundImage',
    ]);
  });

  it('lets the admin choose the form the hero shows', () => {
    const form = BLOCKS.hero.fields.find((field) => field.name === 'formSlug');
    expect(form).toBeTruthy();
    expect(form!.kind).toBe('form');
  });

  it('keeps content-only as the default, so existing heroes are unchanged', () => {
    const parsed = parseBlockContent('hero', {}) as Record<string, unknown>;
    expect(parsed.layout).toBe('content');
    expect(parsed.showForm).toBe(false);
    expect(parsed.formSlug).toBe('');
  });

  it('falls back to a known layout rather than throwing on an unknown one', () => {
    const parsed = parseBlockContent('hero', { layout: 'something-removed' }) as Record<
      string,
      unknown
    >;
    expect(parsed.layout).toBe('content');
  });
});
