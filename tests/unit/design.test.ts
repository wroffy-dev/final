import { describe, it, expect } from 'vitest';
import {
  parseSectionDesign,
  buildSectionStyles,
  resolveColumns,
  normaliseLength,
  normaliseAnchor,
  splitLength,
  joinLength,
  resolveAnchors,
  isInverted,
  DEFAULT_SECTION_DESIGN,
} from '@/lib/cms/design';

describe('length values', () => {
  it('keeps a valid CSS length as typed', () => {
    for (const value of ['40px', '2.5rem', '100%', '5vw', '80vh', '1.25em', '-8px']) {
      expect(normaliseLength(value)).toBe(value);
    }
  });

  it('treats a bare number as pixels, which is what an admin usually means', () => {
    expect(normaliseLength('40')).toBe('40px');
    expect(normaliseLength(24)).toBe('24px');
  });

  it('rejects anything that is not a length', () => {
    expect(normaliseLength('calc(100% - 4px)')).toBe('');
    expect(normaliseLength('red')).toBe('');
    expect(normaliseLength('')).toBe('');
    expect(normaliseLength(null)).toBe('');
  });

  it('round-trips through the number + unit control', () => {
    expect(splitLength('2.5rem')).toEqual({ amount: '2.5', unit: 'rem' });
    expect(joinLength('2.5', 'rem')).toBe('2.5rem');
    // Clearing the number clears the value rather than storing a bare unit.
    expect(joinLength('', 'rem')).toBe('');
  });
});

describe('anchor IDs', () => {
  it('normalises what an admin types into a usable fragment', () => {
    expect(normaliseAnchor('Pricing')).toBe('pricing');
    expect(normaliseAnchor('#pricing')).toBe('pricing');
    expect(normaliseAnchor('Our Pricing Plans')).toBe('our-pricing-plans');
    expect(normaliseAnchor('  spaced  ')).toBe('spaced');
  });

  it('keeps an ID that must start with a letter valid', () => {
    expect(normaliseAnchor('123')).toBe('s-123');
    expect(normaliseAnchor('')).toBe('');
  });

  it('drops duplicates so two sections never share a DOM id', () => {
    const anchors = resolveAnchors([
      { id: 'a', settings: { anchorId: 'pricing' } },
      { id: 'b', settings: { anchorId: 'pricing' } },
      { id: 'c', settings: { anchorId: 'faq' } },
      { id: 'd', settings: {} },
    ]);
    expect(anchors.get('a')).toBe('pricing');
    expect(anchors.has('b')).toBe(false);
    expect(anchors.get('c')).toBe('faq');
    expect(anchors.has('d')).toBe(false);
  });
});

describe('legacy settings upgrade', () => {
  const legacy = {
    background: 'brand',
    paddingTop: 'xl',
    paddingBottom: 'lg',
    width: 'wide',
    anchorId: 'top',
    hideOnMobile: true,
    hideOnDesktop: false,
  };

  it('maps the v1 shape onto the current one without losing anything', () => {
    const design = parseSectionDesign(legacy);
    expect(design.preset).toBe('brand');
    expect(design.widthMode).toBe('wide');
    expect(design.anchorId).toBe('top');
    expect(design.desktop.padding.top).toBe('7rem');
    expect(design.desktop.padding.bottom).toBe('5rem');
    // v1 hid "on mobile" below the lg breakpoint, which covered tablets too.
    expect(design.tablet.hidden).toBe(true);
    expect(design.mobile.hidden).toBe(true);
    expect(design.desktop.hidden).toBe(false);
  });

  it('gives a legacy dark section inverted text', () => {
    expect(isInverted(parseSectionDesign({ background: 'dark' }))).toBe(true);
    expect(isInverted(parseSectionDesign({ background: 'muted' }))).toBe(false);
  });

  it('falls back to defaults instead of throwing on junk', () => {
    expect(parseSectionDesign(null)).toEqual(DEFAULT_SECTION_DESIGN);
    expect(parseSectionDesign('nonsense')).toEqual(DEFAULT_SECTION_DESIGN);
    expect(parseSectionDesign({ preset: 'not-a-preset' }).preset).toBe('default');
  });
});

describe('responsive CSS generation', () => {
  it('emits no media queries for a section left at its defaults', () => {
    const styles = buildSectionStyles(DEFAULT_SECTION_DESIGN, 'abc');
    expect(styles.css).toBe('');
  });

  it('writes desktop values inline and overrides in one query per breakpoint', () => {
    const design = parseSectionDesign({
      desktop: { padding: { top: '80px', right: '', bottom: '80px', left: '' } },
      tablet: { padding: { top: '48px', right: '', bottom: '', left: '' } },
      mobile: { padding: { top: '24px', right: '', bottom: '24px', left: '' }, columns: 1 },
    });
    const styles = buildSectionStyles(design, 'sec1');

    expect(styles.style['--sec-pt']).toBe('80px');
    expect(styles.css).toContain('@media (max-width:1023px)');
    expect(styles.css).toContain('@media (max-width:767px)');
    expect(styles.css).toContain('.sec-sec1{--sec-pt:48px}');
    // Only overridden properties are emitted, so the payload stays tiny.
    expect(styles.css).not.toContain('--sec-pl');
  });

  it('keeps each side of margin and padding independent', () => {
    const design = parseSectionDesign({
      desktop: { padding: { top: '10px', right: '20px', bottom: '30px', left: '40px' } },
    });
    const styles = buildSectionStyles(design, 's');
    expect(styles.style['--sec-pt']).toBe('10px');
    expect(styles.style['--sec-pr']).toBe('20px');
    expect(styles.style['--sec-pb']).toBe('30px');
    expect(styles.style['--sec-pl']).toBe('40px');
  });

  it('builds a gradient and an overlay from the colour settings', () => {
    const design = parseSectionDesign({
      background: {
        type: 'gradient',
        gradientFrom: '#000000',
        gradientTo: '#FFFFFF',
        gradientAngle: 90,
        overlayColor: '#112233',
        overlayOpacity: 50,
      },
    });
    const styles = buildSectionStyles(design, 's');
    expect(styles.layer?.image).toBe('linear-gradient(90deg, #000000, #FFFFFF)');
    expect(styles.overlay).toBe('rgba(17, 34, 51, 0.5)');
  });

  it('marks a section as full width without a container gutter', () => {
    const styles = buildSectionStyles(parseSectionDesign({ widthMode: 'full' }), 's');
    expect(styles.style['--sec-max-w']).toBe('100%');
    expect(styles.style['--sec-px']).toBe('0px');
  });

  it('sanitises the section id used as a CSS class', () => {
    const styles = buildSectionStyles(DEFAULT_SECTION_DESIGN, 'a b}{c');
    expect(styles.className).toBe('sec-abc');
  });
});

describe('responsive columns', () => {
  it("falls back to the block's own column count", () => {
    expect(resolveColumns(DEFAULT_SECTION_DESIGN, 4)).toEqual({ desktop: 4, tablet: 2, mobile: 1 });
  });

  it('lets the design panel win over the block', () => {
    const design = parseSectionDesign({ desktop: { columns: 6 }, tablet: { columns: 3 } });
    expect(resolveColumns(design, 3)).toEqual({ desktop: 6, tablet: 3, mobile: 1 });
  });

  it('inherits downwards when a breakpoint has no value', () => {
    const design = parseSectionDesign({ desktop: { columns: 2 } });
    expect(resolveColumns(design, 4)).toEqual({ desktop: 2, tablet: 2, mobile: 1 });
  });
});
