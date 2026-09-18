import { describe, it, expect } from 'vitest';
import { getBlock, blockDefaults, parseBlockContent } from '@/lib/cms/blocks';
import { isFieldVisible, type FieldDescriptor } from '@/lib/cms/fields';

/**
 * The hero's column split.
 *
 * A hero with copy on one side and a form on the other was an even two columns
 * and nothing else, so a form could not be given less room than the text
 * selling it. The split is a stored choice now, expressed as the copy's share.
 */

function heroField(name: string): FieldDescriptor {
  const field = getBlock('hero')?.fields.find((f) => f.name === name);
  if (!field) throw new Error(`hero has no "${name}" field`);
  return field;
}

describe('the hero divides its row by a stored ratio', () => {
  it('defaults to an even split, so existing heroes are unchanged', () => {
    const defaults = blockDefaults('hero') as { splitRatio?: string };
    expect(defaults.splitRatio).toBe('50');

    // A hero saved before the field existed parses to the same even split.
    const legacy = parseBlockContent('hero', { heading: 'Adobe Reseller in India' }) as {
      splitRatio: string;
    };
    expect(legacy.splitRatio).toBe('50');
  });

  it('accepts the offered ratios and falls back for anything else', () => {
    for (const ratio of ['50', '55', '60', '65', '70']) {
      const parsed = parseBlockContent('hero', { splitRatio: ratio }) as { splitRatio: string };
      expect(parsed.splitRatio).toBe(ratio);
    }

    // Never throws on stored rubbish — it lands on the even split.
    for (const bad of ['80', 'wide', '', null, 60]) {
      const parsed = parseBlockContent('hero', { splitRatio: bad }) as { splitRatio: string };
      expect(parsed.splitRatio).toBe('50');
    }
  });

  it('offers 60 / 40 for a text-and-form hero', () => {
    const field = heroField('splitRatio');
    expect(field.kind).toBe('select');
    const values = field.kind === 'select' ? field.options.map((o) => o.value) : [];
    expect(values).toContain('60');
  });

  it('hides the control when the hero has no second column', () => {
    const field = heroField('splitRatio');

    // Nothing to divide: one column, so the choice would be meaningless.
    expect(isFieldVisible(field, { layout: 'content' })).toBe(false);
    expect(isFieldVisible(field, { layout: 'backgroundImage' })).toBe(false);

    // Every two-column layout offers it.
    expect(isFieldVisible(field, { layout: 'contentForm' })).toBe(true);
    expect(isFieldVisible(field, { layout: 'contentImage' })).toBe(true);
    expect(isFieldVisible(field, { layout: 'contentImageForm' })).toBe(true);
  });
});
