import { describe, it, expect } from 'vitest';
import {
  parseBlogCard,
  parseBlogLayout,
  parseBlogShare,
  parseBlogTypography,
  parsePostOptions,
  resolveToggle,
  cardVars,
  typographyVars,
  enabledNetworks,
  DEFAULT_BLOG_CARD,
  DEFAULT_BLOG_LAYOUT,
  DEFAULT_POST_OPTIONS,
} from '@/lib/cms/blog-settings';
import { resolveCard } from '@/lib/cms/blog-render';

describe('blog settings parsing', () => {
  it('falls back to the defaults for empty, null and nonsense input', () => {
    expect(parseBlogCard(null)).toEqual(DEFAULT_BLOG_CARD);
    expect(parseBlogCard({})).toEqual(DEFAULT_BLOG_CARD);
    expect(parseBlogLayout('not an object')).toEqual(DEFAULT_BLOG_LAYOUT);
    expect(parsePostOptions(undefined)).toEqual(DEFAULT_POST_OPTIONS);
  });

  it('keeps valid values and repairs invalid ones without throwing', () => {
    const card = parseBlogCard({
      showImage: false,
      shadow: 'not-a-shadow',
      radius: '18',
      titleWeight: '600',
      excerptLines: 99,
    });
    expect(card.showImage).toBe(false);
    // An unknown enum member falls back rather than failing the whole save.
    expect(card.shadow).toBe('sm');
    // A bare number is the most common thing an admin types.
    expect(card.radius).toBe('18px');
    expect(card.titleWeight).toBe('600');
    expect(card.excerptLines).toBe(DEFAULT_BLOG_CARD.excerptLines);
  });

  it('treats every colour as an override, so blank means inherit', () => {
    const layout = parseBlogLayout({ primaryColor: '#0061ff', headingColor: 'red' });
    expect(layout.primaryColor).toBe('#0061FF');
    // Not a 6-digit hex, so it is dropped and the website palette wins.
    expect(layout.headingColor).toBe('');
  });

  it('normalises the sidebar width and sticky offset as CSS lengths', () => {
    const layout = parseBlogLayout({ sidebarWidth: '28%', stickyOffset: '120' });
    expect(layout.sidebarWidth).toBe('28%');
    expect(layout.stickyOffset).toBe('120px');
  });
});

describe('per-post overrides', () => {
  it('inherits the blog default unless the post forces a value', () => {
    expect(resolveToggle('default', true)).toBe(true);
    expect(resolveToggle('default', false)).toBe(false);
    expect(resolveToggle('show', false)).toBe(true);
    expect(resolveToggle('hide', true)).toBe(false);
  });

  it('parses a post that predates the options column as all-default', () => {
    const options = parsePostOptions({});
    expect(options.showToc).toBe('default');
    expect(options.sidebarFormSlug).toBe('');
  });
});

describe('section-level card overrides', () => {
  it('leaves the blog defaults alone when a section inherits', () => {
    const card = resolveCard(DEFAULT_BLOG_CARD, {
      cardImage: 'inherit',
      cardExcerpt: 'inherit',
      cardAuthor: 'inherit',
      cardCategory: 'inherit',
      cardDate: 'inherit',
      cardReadTime: 'inherit',
      cardTags: 'inherit',
      cardCta: 'inherit',
    });
    expect(card).toEqual(DEFAULT_BLOG_CARD);
  });

  it('forces an item on or off for that section only', () => {
    const card = resolveCard(DEFAULT_BLOG_CARD, { cardExcerpt: 'hide', cardCta: 'show' });
    expect(card.showExcerpt).toBe(false);
    expect(card.showCta).toBe(true);
    // Untouched items keep the blog-wide value.
    expect(card.showImage).toBe(DEFAULT_BLOG_CARD.showImage);
    expect(DEFAULT_BLOG_CARD.showExcerpt).toBe(true);
  });
});

describe('generated CSS', () => {
  it('emits nothing for a value left at its default', () => {
    const vars = cardVars(DEFAULT_BLOG_CARD);
    expect(vars['--card-bg']).toBeUndefined();
    expect(vars['--card-radius']).toBeUndefined();
    // The border is on by default, so its width and colour are written.
    expect(vars['--card-border-width']).toBe('1px');
  });

  it('writes a zero border width when the border is switched off', () => {
    const vars = cardVars(parseBlogCard({ borderEnabled: false }));
    expect(vars['--card-border-width']).toBe('0px');
  });

  it('emits only the typography roles that were overridden', () => {
    const typography = parseBlogTypography({
      articleTitle: { size: '40px', weight: '800' },
    });
    const vars = typographyVars(typography);
    expect(vars['--blog-article-title-size']).toBe('40px');
    expect(vars['--blog-article-title-weight']).toBe('800');
    expect(vars['--blog-article-title-lh']).toBeUndefined();
    expect(vars['--blog-h2-size']).toBeUndefined();
  });
});

describe('sharing', () => {
  it('lists only the networks that are switched on', () => {
    const share = parseBlogShare({ facebook: false, whatsapp: false });
    expect(enabledNetworks(share)).toEqual(['linkedin', 'x', 'copy']);
  });

  it('returns nothing when every network is off', () => {
    const share = parseBlogShare({
      linkedin: false,
      facebook: false,
      x: false,
      whatsapp: false,
      copy: false,
    });
    expect(enabledNetworks(share)).toEqual([]);
  });
});
