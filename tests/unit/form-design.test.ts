import { describe, it, expect } from 'vitest';
import {
  parseFormDesign,
  buildFormStyles,
  resolveFormColumns,
  isDefaultDesign,
  DEFAULT_FORM_DESIGN,
  formDesignSchema,
} from '@/lib/forms/form-design';
import {
  parseFieldSettings,
  conditionsSatisfied,
  sanitiseCssClass,
  DEFAULT_FIELD_SETTINGS,
} from '@/lib/forms/field-settings';

describe('form design parsing', () => {
  it('falls back to defaults for anything unreadable', () => {
    expect(parseFormDesign(null)).toEqual(DEFAULT_FORM_DESIGN);
    expect(parseFormDesign(undefined)).toEqual(DEFAULT_FORM_DESIGN);
    expect(parseFormDesign('not an object')).toEqual(DEFAULT_FORM_DESIGN);
    expect(parseFormDesign(42)).toEqual(DEFAULT_FORM_DESIGN);
    expect(parseFormDesign([])).toEqual(DEFAULT_FORM_DESIGN);
  });

  it('keeps the values it recognises and ignores keys it does not', () => {
    const design = parseFormDesign({
      layout: { align: 'center' },
      desktop: { columns: 3, rowGap: '24px' },
      somethingFromAFutureVersion: { nope: true },
    });

    expect(design.layout.align).toBe('center');
    expect(design.desktop.columns).toBe(3);
    expect(design.desktop.rowGap).toBe('24px');
  });

  it('normalises a bare number into pixels, the way an admin types it', () => {
    const design = parseFormDesign({ desktop: { rowGap: '24', maxWidth: 640 } });
    expect(design.desktop.rowGap).toBe('24px');
    expect(design.desktop.maxWidth).toBe('640px');
  });

  it('drops a length with no recognised unit rather than emitting broken CSS', () => {
    const design = parseFormDesign({ desktop: { rowGap: '24 furlongs' } });
    expect(design.desktop.rowGap).toBe('');
  });

  /**
   * The security boundary: these values are interpolated into a style
   * attribute, so anything that could close it or start a new declaration has
   * to be rejected rather than escaped.
   */
  it('rejects a colour that is not a colour', () => {
    for (const attempt of [
      'red; background: url(http://evil.test/x)',
      '#fff"><script>alert(1)</script>',
      'url(javascript:alert(1))',
      'expression(alert(1))',
      '}.x{color:red',
    ]) {
      const design = parseFormDesign({ input: { background: attempt } });
      expect(design.input.background).toBe('');
    }
  });

  it('accepts the colour formats a design tool produces', () => {
    expect(parseFormDesign({ input: { background: '#0061FF' } }).input.background).toBe('#0061FF');
    expect(parseFormDesign({ input: { background: '#0061ffcc' } }).input.background).toBe(
      '#0061FFCC'.toLowerCase() === '#0061ffcc' ? '#0061ffcc' : '#0061ffcc',
    );
    expect(parseFormDesign({ input: { background: 'rgb(0, 97, 255)' } }).input.background).toBe(
      'rgb(0, 97, 255)',
    );
    expect(
      parseFormDesign({ input: { background: 'rgba(0, 97, 255, 0.5)' } }).input.background,
    ).toBe('rgba(0, 97, 255, 0.5)');
  });

  it('strips anything that could escape a font-family declaration', () => {
    const design = parseFormDesign({
      typography: { base: { fontFamily: "Inter'; } body { display:none" } },
    });
    expect(design.typography.base.fontFamily).not.toContain("'");
    expect(design.typography.base.fontFamily).not.toContain('}');
    expect(design.typography.base.fontFamily).not.toContain(';');
  });

  it('rejects a button icon key that is not from the closed set', () => {
    expect(parseFormDesign({ button: { icon: '../../etc/passwd' } }).button.icon).toBe('');
    expect(parseFormDesign({ button: { icon: 'send' } }).button.icon).toBe('send');
  });

  it('recognises an untouched design so no CSS is emitted for it', () => {
    expect(isDefaultDesign(DEFAULT_FORM_DESIGN)).toBe(true);
    expect(isDefaultDesign(parseFormDesign({ desktop: { columns: 2 } }))).toBe(false);
  });
});

describe('column resolution', () => {
  it('defaults to a single column, exactly as forms behaved before', () => {
    expect(resolveFormColumns(DEFAULT_FORM_DESIGN)).toEqual({
      desktop: 1,
      tablet: 1,
      mobile: 1,
    });
  });

  it('narrows towards mobile rather than widening', () => {
    const design = parseFormDesign({ desktop: { columns: 3 } });
    const columns = resolveFormColumns(design);

    expect(columns.desktop).toBe(3);
    expect(columns.tablet).toBe(2);
    expect(columns.mobile).toBe(1);
  });

  it('honours an explicit override at each breakpoint', () => {
    const design = parseFormDesign({
      desktop: { columns: 4 },
      tablet: { columns: 3 },
      mobile: { columns: 2 },
    });
    expect(resolveFormColumns(design)).toEqual({ desktop: 4, tablet: 3, mobile: 2 });
  });

  it('clamps a column count outside the supported range', () => {
    expect(resolveFormColumns(parseFormDesign({ desktop: { columns: 99 } })).desktop).toBe(1);
    expect(resolveFormColumns(parseFormDesign({ desktop: { columns: 0 } })).desktop).toBe(1);
  });
});

describe('style compilation', () => {
  it('emits nothing for an untouched design', () => {
    const styles = buildFormStyles(DEFAULT_FORM_DESIGN, 'contact');

    expect(styles.css).toBe('');
    // Only the column count, which matches the historical single-column layout.
    expect(styles.style).toEqual({ '--fd-cols': '1' });
  });

  it('builds a class name safe to use in a selector', () => {
    expect(buildFormStyles(DEFAULT_FORM_DESIGN, 'contact-us').className).toBe('fd-contact-us');
    // A slug that somehow contained a selector break cannot produce one.
    expect(buildFormStyles(DEFAULT_FORM_DESIGN, 'a{}.b').className).toBe('fd-ab');
  });

  it('puts desktop values inline so they beat the stylesheet', () => {
    const design = parseFormDesign({
      desktop: { rowGap: '24px', columnGap: '12px', maxWidth: '640px' },
    });
    const styles = buildFormStyles(design, 'contact');

    expect(styles.style['--fd-row-gap']).toBe('24px');
    expect(styles.style['--fd-col-gap']).toBe('12px');
    expect(styles.style['--fd-max-w']).toBe('640px');
  });

  it('emits one media query per breakpoint that overrides something', () => {
    const design = parseFormDesign({
      desktop: { columns: 3 },
      mobile: { rowGap: '8px' },
    });
    const styles = buildFormStyles(design, 'contact');

    expect(styles.css).toContain('@media (max-width:767px)');
    expect(styles.css).toContain('--fd-row-gap:8px');
    // Tablet inherits the derived column count, so it does emit one rule.
    expect(styles.css).toContain('@media (max-width:1023px)');
  });

  it('turns four-sided spacing into one shorthand, filling gaps with zero', () => {
    const design = parseFormDesign({
      desktop: { padding: { top: '20px', right: '', bottom: '10px', left: '' } },
    });
    expect(buildFormStyles(design, 'x').style['--fd-padding']).toBe('20px 0px 10px 0px');
  });

  it('emits no padding at all when every side is empty', () => {
    expect(buildFormStyles(DEFAULT_FORM_DESIGN, 'x').style['--fd-padding']).toBeUndefined();
  });

  it('writes hover and disabled button states as scoped rules', () => {
    const design = parseFormDesign({
      button: { hoverBackground: '#123456', disabledBackground: '#EEEEEE' },
    });
    const styles = buildFormStyles(design, 'contact');

    expect(styles.css).toContain('.fd-contact .fd-submit:not(:disabled):hover');
    expect(styles.css).toContain('background:#123456');
    expect(styles.css).toContain('.fd-contact .fd-submit:disabled');
  });

  it('treats a border width with no style as a solid border', () => {
    const design = parseFormDesign({ container: { border: { width: '2px', color: '#000000' } } });
    const styles = buildFormStyles(design, 'x');

    expect(styles.style['--fd-border-style']).toBe('solid');
    expect(styles.style['--fd-border-width']).toBe('2px');
  });

  it('builds a gradient from the configured stops', () => {
    const design = parseFormDesign({
      container: {
        background: { type: 'gradient', gradientFrom: '#000000', gradientTo: '#FFFFFF', gradientAngle: 90 },
      },
    });
    expect(buildFormStyles(design, 'x').style['--fd-bg-image']).toBe(
      'linear-gradient(90deg, #000000, #FFFFFF)',
    );
  });

  it('resolves a font family to a stack with a real fallback', () => {
    const design = parseFormDesign({ typography: { base: { fontFamily: 'Inter' } } });
    const font = buildFormStyles(design, 'x').style['--fd-base-font'];

    expect(font).toContain("'Inter'");
    expect(font).toContain('system-ui');
  });

  it('converts an overlay to rgba at the configured opacity', () => {
    const design = parseFormDesign({
      container: { background: { type: 'solid', color: '#FFFFFF', overlayColor: '#000000', overlayOpacity: 50 } },
    });
    expect(buildFormStyles(design, 'x').overlay).toBe('rgba(0, 0, 0, 0.50)');
  });

  /**
   * Nothing admin-entered may reach a selector — only declaration values, each
   * already narrowed to a length, a validated colour or an enum.
   */
  it('never emits a brace or semicolon from an admin value into the stylesheet', () => {
    const design = parseFormDesign({
      button: { hoverBackground: '#fff}.evil{color:red', hoverTextColor: 'blue;x:y' },
      desktop: { rowGap: '}.evil{' },
    });
    const styles = buildFormStyles(design, 'x');

    // Both hostile colours were rejected outright, so no rule is emitted.
    expect(styles.css).not.toContain('evil');
    expect(styles.style['--fd-row-gap']).toBeUndefined();
  });
});

describe('field settings', () => {
  it('falls back to defaults for anything unreadable', () => {
    expect(parseFieldSettings(null)).toEqual(DEFAULT_FIELD_SETTINGS);
    expect(parseFieldSettings('nope')).toEqual(DEFAULT_FIELD_SETTINGS);
  });

  it('caps the number of conditions', () => {
    const many = Array.from({ length: 20 }, () => ({
      field: 'x',
      operator: 'equals' as const,
      value: 'y',
    }));
    // Over the cap the whole array is rejected, leaving the field always visible
    // rather than half-configured.
    expect(parseFieldSettings({ conditions: many }).conditions).toEqual([]);
  });

  it('keeps a condition list within the cap', () => {
    const settings = parseFieldSettings({
      conditions: [{ field: 'interest', operator: 'equals', value: 'business' }],
    });
    expect(settings.conditions).toHaveLength(1);
    expect(settings.conditions[0]!.field).toBe('interest');
  });
});

describe('css class sanitising', () => {
  it('keeps normal class names', () => {
    expect(sanitiseCssClass('my-field wide')).toBe('my-field wide');
    expect(sanitiseCssClass('sm:col-span-2')).toBe('sm:col-span-2');
  });

  it('strips anything that could break out of the attribute', () => {
    expect(sanitiseCssClass('a" onmouseover="alert(1)')).not.toContain('"');
    expect(sanitiseCssClass("x' onclick='y")).not.toContain("'");
    expect(sanitiseCssClass('<script>')).not.toContain('<');
    expect(sanitiseCssClass('a>b')).not.toContain('>');
  });

  it('caps how many classes and how long each may be', () => {
    const many = Array.from({ length: 30 }, (_, i) => `c${i}`).join(' ');
    expect(sanitiseCssClass(many).split(' ')).toHaveLength(8);
    expect(sanitiseCssClass('x'.repeat(100))).toBe('');
  });

  it('returns empty for anything that is not a string', () => {
    expect(sanitiseCssClass(null)).toBe('');
    expect(sanitiseCssClass(42)).toBe('');
  });
});

describe('conditional visibility', () => {
  const known = new Set(['interest', 'size']);

  function settings(overrides: Record<string, unknown>) {
    return parseFieldSettings(overrides);
  }

  it('shows a field with no conditions', () => {
    expect(conditionsSatisfied(DEFAULT_FIELD_SETTINGS, {}, known)).toBe(true);
  });

  it('matches on equality, ignoring case and surrounding space', () => {
    const s = settings({
      conditions: [{ field: 'interest', operator: 'equals', value: 'Business' }],
    });
    expect(conditionsSatisfied(s, { interest: 'business' }, known)).toBe(true);
    expect(conditionsSatisfied(s, { interest: '  BUSINESS  ' }, known)).toBe(true);
    expect(conditionsSatisfied(s, { interest: 'enterprise' }, known)).toBe(false);
  });

  it('supports the full operator set', () => {
    const cases: Array<[string, string, Record<string, unknown>, boolean]> = [
      ['not_equals', 'business', { interest: 'enterprise' }, true],
      ['not_equals', 'business', { interest: 'business' }, false],
      ['contains', 'busi', { interest: 'business' }, true],
      ['contains', 'zzz', { interest: 'business' }, false],
      ['is_empty', '', { interest: '' }, true],
      ['is_empty', '', { interest: 'business' }, false],
      ['is_not_empty', '', { interest: 'business' }, true],
      ['is_not_empty', '', { interest: '' }, false],
    ];

    for (const [operator, value, values, expected] of cases) {
      const s = settings({ conditions: [{ field: 'interest', operator, value }] });
      expect(conditionsSatisfied(s, values, known), `${operator} ${value}`).toBe(expected);
    }
  });

  it('requires every condition under "all" and any under "any"', () => {
    const conditions = [
      { field: 'interest', operator: 'equals', value: 'business' },
      { field: 'size', operator: 'equals', value: 'large' },
    ];

    const all = settings({ conditions, conditionMatch: 'all' });
    const any = settings({ conditions, conditionMatch: 'any' });
    const partial = { interest: 'business', size: 'small' };

    expect(conditionsSatisfied(all, partial, known)).toBe(false);
    expect(conditionsSatisfied(any, partial, known)).toBe(true);
    expect(conditionsSatisfied(all, { interest: 'business', size: 'large' }, known)).toBe(true);
  });

  /**
   * A renamed or deleted field must not silently hide a question — that would
   * quietly stop collecting an answer with nothing to show why.
   */
  it('ignores a condition naming a field that no longer exists', () => {
    const s = settings({
      conditions: [{ field: 'deleted_field', operator: 'equals', value: 'x' }],
    });
    expect(conditionsSatisfied(s, {}, known)).toBe(true);
  });

  it('reads a multi-value answer as its joined text', () => {
    const s = settings({ conditions: [{ field: 'interest', operator: 'contains', value: 'b' }] });
    expect(conditionsSatisfied(s, { interest: ['a', 'b'] }, known)).toBe(true);
  });
});

describe('schema stability', () => {
  /**
   * The stored shape is versioned so a future change can be migrated rather
   * than guessed at. If this number changes, existing rows need a migration
   * path — the test exists to make that a deliberate decision.
   */
  it('is version 1', () => {
    expect(formDesignSchema.parse({}).version).toBe(1);
  });
});
