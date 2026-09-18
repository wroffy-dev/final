import { describe, it, expect } from 'vitest';
import { buildTableOfContents } from '@/lib/cms/blog-toc';
import { sanitizeHtml } from '@/lib/utils/sanitize';

describe('table of contents', () => {
  it('builds the outline from H2 and H3 and stamps matching anchors', () => {
    const { html, items } = buildTableOfContents(
      '<h2>Plan the migration</h2><p>Body</p><h3>Map sharing</h3><h2>Go live</h2>',
    );

    expect(items).toEqual([
      { id: 'plan-the-migration', text: 'Plan the migration', level: 2 },
      { id: 'map-sharing', text: 'Map sharing', level: 3 },
      { id: 'go-live', text: 'Go live', level: 2 },
    ]);
    for (const item of items) expect(html).toContain(`id="${item.id}"`);
  });

  it('omits H3 from the list when asked, but still anchors it', () => {
    const { html, items } = buildTableOfContents('<h2>One</h2><h3>Two</h3>', {
      includeH3: false,
    });
    expect(items.map((item) => item.text)).toEqual(['One']);
    expect(html).toContain('id="two"');
  });

  it('never emits the same anchor twice', () => {
    const { items } = buildTableOfContents('<h2>Pricing</h2><h2>Pricing</h2><h2>Pricing</h2>');
    expect(items.map((item) => item.id)).toEqual(['pricing', 'pricing-2', 'pricing-3']);
  });

  it('keeps a heading that already has an id addressable', () => {
    const { html, items } = buildTableOfContents('<h2 id="custom-anchor">Anything</h2>');
    expect(items[0]?.id).toBe('custom-anchor');
    expect(html).toContain('id="custom-anchor"');
  });

  it('reads the text through markup and entities', () => {
    const { items } = buildTableOfContents('<h2>Dropbox <strong>&amp;</strong> Sign</h2>');
    expect(items[0]?.text).toBe('Dropbox & Sign');
  });

  it('skips an empty heading rather than producing a blank entry', () => {
    const { items } = buildTableOfContents('<h2></h2><h2>Real</h2>');
    expect(items.map((item) => item.text)).toEqual(['Real']);
  });

  it('only adds ids — it cannot reintroduce anything the sanitiser removed', () => {
    const clean = sanitizeHtml('<h2 onclick="steal()">Heading</h2><script>steal()</script>');
    const { html } = buildTableOfContents(clean);
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(html).toContain('id="heading"');
  });

  it('returns an empty result for an article with no headings', () => {
    expect(buildTableOfContents('<p>Just prose.</p>').items).toEqual([]);
    expect(buildTableOfContents('')).toEqual({ html: '', items: [] });
  });
});
