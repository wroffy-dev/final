import { describe, it, expect } from 'vitest';
import { parseBlockContent, BLOCKS } from '@/lib/cms/blocks';

/**
 * The card toggles are CMS content, so their contract is the parsed block:
 * what an admin saved, and what a section saved before the toggles existed
 * resolves to.
 */
const CARD_BLOCKS = ['productGrid', 'productCards'] as const;

const TOGGLES = [
  'showImage',
  'showName',
  'linkName',
  'showDescription',
  'showPrice',
  'showFeatures',
  'showCta',
  'showDetailsLink',
  'showActions',
] as const;

describe('product card toggles', () => {
  it('defaults every toggle on, matching the behaviour before they existed', () => {
    for (const type of CARD_BLOCKS) {
      const content = parseBlockContent(type, {}) as Record<string, unknown>;
      for (const toggle of TOGGLES) {
        expect(content[toggle], `${type}.${toggle}`).toBe(true);
      }
    }
  });

  it('is backward compatible with a section saved before the toggles existed', () => {
    // Exactly what an older productGrid section's settings JSON looked like.
    const legacy = {
      heading: 'Our plans',
      source: 'featured',
      limit: 3,
      columns: 3,
      showPrice: false,
      showFeatures: true,
    };
    const content = parseBlockContent('productGrid', legacy) as Record<string, unknown>;

    // The admin's own saved choice survives…
    expect(content.showPrice).toBe(false);
    expect(content.showFeatures).toBe(true);
    // …and every new toggle fills in as "as it was before".
    expect(content.showName).toBe(true);
    expect(content.linkName).toBe(true);
    expect(content.showDetailsLink).toBe(true);
    expect(content.showActions).toBe(true);
  });

  it('round-trips each toggle switched off', () => {
    for (const type of CARD_BLOCKS) {
      for (const toggle of TOGGLES) {
        const content = parseBlockContent(type, { [toggle]: false }) as Record<string, unknown>;
        expect(content[toggle], `${type}.${toggle} off`).toBe(false);
        // Turning one off must not disturb the others.
        for (const other of TOGGLES) {
          if (other !== toggle) expect(content[other], `${type}.${other}`).toBe(true);
        }
      }
    }
  });

  it('exposes every toggle in the CMS content panel, not just in code', () => {
    for (const type of CARD_BLOCKS) {
      const names = BLOCKS[type].fields.map((field) => field.name);
      for (const toggle of TOGGLES) {
        expect(names, `${type} should offer ${toggle}`).toContain(toggle);
      }
      // And each is a real on/off control.
      for (const field of BLOCKS[type].fields) {
        if ((TOGGLES as readonly string[]).includes(field.name)) {
          expect(field.kind, `${type}.${field.name}`).toBe('boolean');
        }
      }
    }
  });

  it('ignores a junk value rather than throwing', () => {
    const content = parseBlockContent('productGrid', {
      showActions: 'nonsense',
      linkName: null,
    }) as Record<string, unknown>;
    // Zod defaults win, so a corrupt settings blob still renders.
    expect(typeof content.showActions).toBe('boolean');
    expect(typeof content.linkName).toBe('boolean');
  });
});
