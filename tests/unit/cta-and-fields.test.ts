import { describe, it, expect } from 'vitest';
import { parseBlockContent, BLOCKS } from '@/lib/cms/blocks';
import { buildPanelStyles, panelDesignSchema, DEFAULT_PANEL_DESIGN } from '@/lib/cms/design';
import { readFieldPath, isFieldVisible, writeFieldPath } from '@/lib/cms/fields';

describe('nested field paths', () => {
  it('reads a value several levels down', () => {
    const values = { panel: { background: { type: 'solid', color: '#fff' } } };
    expect(readFieldPath(values, 'panel.background.type')).toBe('solid');
    expect(readFieldPath(values, 'panel.background.color')).toBe('#fff');
  });

  it('reads a plain name as a direct lookup', () => {
    expect(readFieldPath({ heading: 'Hi' }, 'heading')).toBe('Hi');
  });

  it('returns undefined instead of throwing on a missing branch', () => {
    expect(readFieldPath({}, 'panel.background.type')).toBeUndefined();
    expect(readFieldPath({ panel: null }, 'panel.background.type')).toBeUndefined();
    expect(readFieldPath({ panel: 'text' }, 'panel.background.type')).toBeUndefined();
  });

  it('writes a nested value without mutating the original', () => {
    const before = { panel: { background: { type: 'none' } }, heading: 'Hi' };
    const after = writeFieldPath(before, 'panel.background.type', 'solid');

    expect(readFieldPath(after, 'panel.background.type')).toBe('solid');
    // The original object is untouched, so React sees a genuine change.
    expect(before.panel.background.type).toBe('none');
    expect(after).not.toBe(before);
    expect(after.panel).not.toBe(before.panel);
    // Siblings survive.
    expect(after.heading).toBe('Hi');
  });

  it('creates missing levels on the way down', () => {
    const after = writeFieldPath({}, 'panel.background.color', '#123456');
    expect(readFieldPath(after, 'panel.background.color')).toBe('#123456');
  });

  it('lets showWhen depend on a nested value', () => {
    const field = {
      kind: 'color' as const,
      name: 'panel.background.color',
      label: 'Colour',
      showWhen: { field: 'panel.background.type', equals: ['solid'] },
    };
    expect(isFieldVisible(field, { panel: { background: { type: 'solid' } } })).toBe(true);
    expect(isFieldVisible(field, { panel: { background: { type: 'none' } } })).toBe(false);
  });
});

describe('cta block', () => {
  it('keeps every variant that already existed working', () => {
    for (const variant of ['panel', 'plain', 'split']) {
      const content = parseBlockContent('cta', { variant }) as Record<string, unknown>;
      expect(content.variant).toBe(variant);
    }
    // …and adds the new one.
    expect(
      (parseBlockContent('cta', { variant: 'simple' }) as Record<string, unknown>).variant,
    ).toBe('simple');
  });

  it('falls back to panel for an unknown variant rather than throwing', () => {
    const content = parseBlockContent('cta', { variant: 'removed-style' }) as Record<
      string,
      unknown
    >;
    expect(content.variant).toBe('panel');
  });

  it('defaults a section saved before these controls to its old behaviour', () => {
    const legacy = { heading: 'Talk to us', primaryCtaLabel: 'Contact', variant: 'panel' };
    const content = parseBlockContent('cta', legacy) as Record<string, unknown>;

    expect(content.showPrimaryCta).toBe(true);
    expect(content.showSecondaryCta).toBe(true);
    expect(content.alignment).toBe('center');
    expect(content.eyebrow).toBe('');
    // No panel background chosen, so the brand panel is kept.
    expect(buildPanelStyles(panelDesignSchema.parse(content.panel)).hasBackground).toBe(false);
  });

  it('offers every control the brief lists', () => {
    const names = BLOCKS.cta.fields.map((field) => field.name);
    for (const name of [
      'eyebrow',
      'heading',
      'description',
      'primaryCtaLabel',
      'primaryCtaUrl',
      'showPrimaryCta',
      'secondaryCtaLabel',
      'secondaryCtaUrl',
      'showSecondaryCta',
      'alignment',
      'variant',
      'panel.background.type',
      'panel.background.imageId',
      'panel.background.imagePosition',
      'panel.background.imageSize',
      'panel.background.imageRepeat',
      'panel.background.imageAttachment',
      'panel.background.overlayColor',
      'panel.background.overlayOpacity',
      'panel.borderEnabled',
      'panel.borderColor',
      'panel.borderWidth',
      'panel.radius',
      'panel.shadow',
      'panel.padding.top',
      'panel.headingColor',
      'panel.textColor',
    ]) {
      expect(names, `cta should offer ${name}`).toContain(name);
    }
  });
});

describe('panel styling', () => {
  it('reports no background until the admin sets one', () => {
    expect(buildPanelStyles(DEFAULT_PANEL_DESIGN).hasBackground).toBe(false);
  });

  it('renders a solid colour', () => {
    const panel = panelDesignSchema.parse({ background: { type: 'solid', color: '#102030' } });
    const styles = buildPanelStyles(panel);
    expect(styles.hasBackground).toBe(true);
    expect(styles.style.backgroundColor).toBe('#102030');
    // Lowercase in, normalised out — one canonical form per colour.
    expect(
      buildPanelStyles(panelDesignSchema.parse({ background: { type: 'solid', color: '#aabbcc' } }))
        .style.backgroundColor,
    ).toBe('#AABBCC');
  });

  it('renders a gradient at the chosen angle', () => {
    const panel = panelDesignSchema.parse({
      background: {
        type: 'gradient',
        gradientFrom: '#000000',
        gradientTo: '#ffffff',
        gradientAngle: 90,
      },
    });
    const styles = buildPanelStyles(panel);
    expect(styles.hasBackground).toBe(true);
    // The design engine normalises hex colours to uppercase, so assert that.
    expect(styles.style.backgroundImage).toBe('linear-gradient(90deg, #000000, #FFFFFF)');
  });

  it('renders a background image with its position, size, repeat and attachment', () => {
    const panel = panelDesignSchema.parse({
      background: {
        type: 'image',
        imageId: 'm1',
        imagePosition: 'top',
        imageSize: 'contain',
        imageRepeat: 'repeat-x',
        imageAttachment: 'fixed',
      },
    });
    const styles = buildPanelStyles(panel, '/uploads/hero.png');
    expect(styles.style.backgroundImage).toBe('url("/uploads/hero.png")');
    expect(styles.style.backgroundPosition).toBe('top');
    expect(styles.style.backgroundSize).toBe('contain');
    expect(styles.style.backgroundRepeat).toBe('repeat-x');
    expect(styles.style.backgroundAttachment).toBe('fixed');
  });

  it('escapes a quote in an image URL so the CSS cannot be broken out of', () => {
    const panel = panelDesignSchema.parse({ background: { type: 'image', imageId: 'm1' } });
    const styles = buildPanelStyles(panel, '/uploads/a".png');
    expect(styles.style.backgroundImage).not.toContain('".png"');
    expect(styles.style.backgroundImage).toContain('%22');
  });

  it('reports no background for an image type with no image chosen', () => {
    const panel = panelDesignSchema.parse({ background: { type: 'image', imageId: null } });
    expect(buildPanelStyles(panel, null).hasBackground).toBe(false);
  });

  it('applies border, radius, shadow and padding', () => {
    const panel = panelDesignSchema.parse({
      borderEnabled: true,
      borderColor: '#ff0000',
      borderWidth: '2px',
      radius: '20px',
      shadow: 'lg',
      padding: { top: '40px', right: '', bottom: '40px', left: '' },
    });
    const styles = buildPanelStyles(panel);
    expect(styles.style.borderStyle).toBe('solid');
    expect(styles.style.borderWidth).toBe('2px');
    expect(styles.style.borderColor).toBe('#FF0000');
    expect(styles.style.borderRadius).toBe('20px');
    expect(styles.style.boxShadow).toContain('0 10px 30px');
    expect(styles.style.paddingTop).toBe('40px');
    expect(styles.style.paddingBottom).toBe('40px');
    // An empty side is left to the class, not written as an empty string.
    expect(styles.style.paddingLeft).toBeUndefined();
  });

  it('produces an overlay only when both colour and opacity are set', () => {
    const none = panelDesignSchema.parse({
      background: { overlayColor: '#000000', overlayOpacity: 0 },
    });
    expect(buildPanelStyles(none).overlay).toBeNull();

    const some = panelDesignSchema.parse({
      background: { overlayColor: '#000000', overlayOpacity: 50 },
    });
    expect(buildPanelStyles(some).overlay).toBeTruthy();
  });
});
