import { describe, it, expect } from 'vitest';
import {
  BLOCKS,
  BLOCK_PICKER_LIST,
  blocksForSurface,
  blockDefaults,
  parseBlockContent,
  getBlock,
  BLOCK_GROUPS,
  BLOCK_SURFACES,
} from '@/lib/cms/blocks';
import { BLOG_BLOCKS } from '@/lib/cms/blog-blocks';
import { DEFAULT_SECTIONS, synthesiseSections } from '@/lib/cms/blog-defaults';

describe('block registry', () => {
  it('keeps the page picker free of blog-only blocks', () => {
    const pageTypes = BLOCK_PICKER_LIST.map((block) => block.type);
    expect(pageTypes).toContain('hero');
    expect(pageTypes).not.toContain('blogHero');
    expect(pageTypes).not.toContain('widgetSearch');
    expect(pageTypes).not.toContain('articleHeader');
  });

  it('offers each blog surface only the blocks written for it', () => {
    const listing = blocksForSurface('blogListing').map((block) => block.type);
    const article = blocksForSurface('blogArticle').map((block) => block.type);
    const sidebar = blocksForSurface('blogSidebar').map((block) => block.type);

    expect(listing).toContain('blogHero');
    expect(listing).toContain('blogGrid');
    expect(listing).not.toContain('articleHeader');
    expect(listing).not.toContain('widgetSearch');

    expect(article).toContain('articleContent');
    expect(article).not.toContain('blogHero');

    expect(sidebar).toContain('widgetPosts');
    expect(sidebar).not.toContain('blogGrid');
  });

  it('shares the generic blocks that opted in to more than one surface', () => {
    expect(BLOCKS.divider?.surfaces).toContain('page');
    expect(BLOCKS.divider?.surfaces).toContain('blogListing');
    expect(blocksForSurface('page').map((b) => b.type)).toContain('divider');
  });

  it('declares a valid group and surface set on every blog block', () => {
    for (const block of Object.values(BLOG_BLOCKS)) {
      expect(BLOCK_GROUPS).toContain(block.group);
      for (const surface of block.surfaces ?? []) {
        expect(BLOCK_SURFACES).toContain(surface);
      }
      expect(block.surfaces?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('parses every blog block from an empty payload without throwing', () => {
    for (const type of Object.keys(BLOG_BLOCKS)) {
      expect(() => blockDefaults(type)).not.toThrow();
      expect(() => parseBlockContent(type, {})).not.toThrow();
      expect(() => parseBlockContent(type, null)).not.toThrow();
      expect(() => parseBlockContent(type, { nonsense: Symbol.iterator })).not.toThrow();
    }
  });

  it('marks the article anatomy as one-per-layout', () => {
    expect(getBlock('articleContent')?.singleton).toBe(true);
    expect(getBlock('articleHeader')?.singleton).toBe(true);
    // Anything an admin might legitimately want twice is not a singleton.
    expect(getBlock('blogGrid')?.singleton).toBeUndefined();
    expect(getBlock('articleShare')?.singleton).toBeUndefined();
  });

  it('gives every field a name the editor can address', () => {
    for (const block of Object.values(BLOG_BLOCKS)) {
      for (const field of block.fields) {
        expect(field.name).toBeTruthy();
        expect(field.label).toBeTruthy();
      }
    }
  });
});

describe('built-in arrangements', () => {
  it('only references blocks that exist and belong on that surface', () => {
    const surfaceKey = {
      LISTING: 'blogListing',
      ARTICLE: 'blogArticle',
      SIDEBAR: 'blogSidebar',
    } as const;

    for (const [surface, seeds] of Object.entries(DEFAULT_SECTIONS)) {
      for (const seed of seeds) {
        const definition = getBlock(seed.blockType);
        expect(definition, `${surface}: ${seed.blockType}`).toBeTruthy();
        expect(definition!.surfaces ?? ['page']).toContain(
          surfaceKey[surface as keyof typeof surfaceKey],
        );
      }
    }
  });

  it('synthesises a complete, ordered set the renderer can consume', () => {
    const sections = synthesiseSections('LISTING');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((section) => section.isVisible)).toBe(true);
    expect(sections.map((section) => section.sortOrder)).toEqual(
      sections.map((_, index) => (index + 1) * 10),
    );
    // Synthesised ids must never look like database ids.
    expect(sections.every((section) => section.id.startsWith('default-'))).toBe(true);
  });

  it('lays out the article with a header, a body and the pieces around them', () => {
    const types = synthesiseSections('ARTICLE').map((section) => section.blockType);
    expect(types).toContain('articleHeader');
    expect(types).toContain('articleContent');
    expect(types.indexOf('articleHeader')).toBeLessThan(types.indexOf('articleContent'));
  });

  it('never puts the same singleton on a surface twice', () => {
    for (const surface of ['LISTING', 'ARTICLE', 'SIDEBAR'] as const) {
      const singles = synthesiseSections(surface)
        .filter((section) => getBlock(section.blockType)?.singleton)
        .map((section) => section.blockType);
      expect(new Set(singles).size).toBe(singles.length);
    }
  });
});
