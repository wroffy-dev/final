import { describe, it, expect } from 'vitest';
import { BLOCKS, BLOCK_LIST, BLOCK_PICKER_LIST, getBlock, parseBlockContent, blockDefaults } from '@/lib/cms/blocks';
import { googleFontsHref, fontStack, nearestWeight, findGoogleFont } from '@/lib/cms/google-fonts';
import { newField, starterFields, uniqueFieldName, EMPTY_FORM } from '@/lib/cms/form-model';

describe('block registry', () => {
  it('registers every section type the page builder offers', () => {
    for (const type of [
      'hero',
      'imageCards',
      'iconCards',
      'imageBox',
      'iconBox',
      'listSection',
      'headingText',
      'textListImage',
      'statistics',
      'productGrid',
      'faq',
      'cta',
    ]) {
      expect(getBlock(type), `missing block: ${type}`).not.toBeNull();
    }
  });

  it('keeps every block self-describing so the editor stays generic', () => {
    for (const block of BLOCK_LIST) {
      expect(block.type, 'block needs a type').toBeTruthy();
      expect(block.label, `${block.type} needs a label`).toBeTruthy();
      expect(block.fields.length, `${block.type} needs fields`).toBeGreaterThan(0);
      // Every block must produce valid defaults with no input at all.
      expect(() => blockDefaults(block.type)).not.toThrow();
    }
  });

  it('hides superseded blocks from the picker but still renders them', () => {
    expect(BLOCK_PICKER_LIST.some((b) => b.type === 'stats')).toBe(false);
    // The old block stays registered so existing pages keep working.
    expect(getBlock('stats')).not.toBeNull();
    expect(BLOCKS.stats!.supersededBy).toBe('statistics');
  });

  it('falls back to defaults rather than throwing on partial content', () => {
    const hero = parseBlockContent<{ heading: string; layout: string }>('hero', { heading: 'Hi' });
    expect(hero.heading).toBe('Hi');
    expect(hero.layout).toBe('content');

    const junk = parseBlockContent<{ layout: string }>('hero', { layout: 42 });
    expect(junk.layout).toBe('content');
  });

  it('keeps the hero form optional and never defaults to a specific form', () => {
    const hero = blockDefaults('hero');
    expect(hero.showForm).toBe(false);
    expect(hero.formSlug).toBe('');
    expect(hero.imageId).toBeNull();
  });

  it('offers every product source the product grid advertises', () => {
    const source = BLOCKS.productGrid!.fields.find((f) => f.name === 'source');
    expect(source?.kind).toBe('select');
    const values = source?.kind === 'select' ? source.options.map((o) => o.value) : [];
    expect(values).toEqual(
      expect.arrayContaining(['all', 'selected', 'featured', 'category', 'brand', 'latest']),
    );
  });
});

describe('google fonts', () => {
  it('requests only the families and weights actually chosen', () => {
    const href = googleFontsHref([
      { family: 'Inter', weights: [400, 700] },
      { family: 'Lora', weights: [500] },
    ]);
    expect(href).toContain('family=Inter:wght@400;700');
    expect(href).toContain('family=Lora:wght@500');
    // Nothing else from the catalogue is requested.
    expect(href).not.toContain('Poppins');
  });

  it('merges duplicate families into one request', () => {
    const href = googleFontsHref([
      { family: 'Inter', weights: [400] },
      { family: 'Inter', weights: [700] },
    ]);
    expect(href?.match(/family=Inter/g)?.length).toBe(1);
    expect(href).toContain('400;700');
  });

  it('skips a family that is not in the catalogue rather than guessing', () => {
    expect(googleFontsHref([{ family: 'Definitely Not A Font', weights: [400] }])).toBeNull();
    expect(googleFontsHref([])).toBeNull();
  });

  it('clamps a weight to one the family actually ships', () => {
    // Lora ships 400-700 only.
    expect(nearestWeight('Lora', 100)).toBe(400);
    expect(nearestWeight('Lora', 900)).toBe(700);
    expect(nearestWeight('Inter', 500)).toBe(500);
  });

  it('builds a font stack with a real fallback for the right category', () => {
    expect(fontStack('Lora')).toContain('Georgia');
    expect(fontStack('Inter')).toContain('system-ui');
    expect(fontStack('')).not.toContain("''");
  });

  it('never lets a font name break out of the CSS declaration', () => {
    const stack = fontStack('Evil"; } body { display:none } .x {');
    expect(stack).not.toContain('}');
    expect(stack).not.toContain('"');
    expect(stack).not.toContain(';');
  });

  it('resolves catalogue lookups case-insensitively', () => {
    expect(findGoogleFont('inter')?.family).toBe('Inter');
    expect(findGoogleFont('  DM Sans ')?.family).toBe('DM Sans');
    expect(findGoogleFont('nope')).toBeNull();
  });
});

describe('form builder model', () => {
  /*
   * These are plain values in a neutral module rather than exports of the
   * `'use client'` builder. That is what makes /admin/forms/new work: a Server
   * Component can spread EMPTY_FORM and call the factories directly.
   */
  it('produces a usable blank form', () => {
    expect(EMPTY_FORM.fields).toEqual([]);
    expect(EMPTY_FORM.isActive).toBe(true);
    expect(EMPTY_FORM.submitLabel).toBeTruthy();
  });

  it('builds the lead-mapped starter fields for a brand new form', () => {
    const fields = starterFields();
    expect(fields.map((f) => f.type)).toEqual(['NAME', 'EMAIL', 'PHONE', 'COMPANY']);
    expect(fields.filter((f) => f.isRequired).map((f) => f.type)).toEqual(['NAME', 'EMAIL']);
    expect(fields.every((f) => f.name)).toBe(true);
  });

  it('gives every field a unique React key', () => {
    const keys = [...starterFields(), newField('TEXT'), newField('TEXT')].map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('supports the newer field types', () => {
    expect(newField('URL').type).toBe('URL');
    expect(newField('DATE').type).toBe('DATE');
    // A consent box is required by default and spans the full width.
    const consent = newField('CONSENT');
    expect(consent.isRequired).toBe(true);
    expect(consent.width).toBe('full');
  });

  it('seeds options only for the field types that need them', () => {
    expect(newField('SELECT').options.length).toBe(1);
    expect(newField('RADIO').options.length).toBe(1);
    expect(newField('TEXT').options).toEqual([]);
  });

  it('keeps machine names unique when a field is duplicated', () => {
    const fields = [newField('TEXT')];
    fields[0]!.name = 'company';
    expect(uniqueFieldName('company', fields)).toBe('company_2');

    fields.push({ ...newField('TEXT'), name: 'company_2' });
    expect(uniqueFieldName('company', fields)).toBe('company_3');
  });
});
