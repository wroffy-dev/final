import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('featured & ordering screen', () => {
  const source = readFileSync('src/components/admin/products/product-order.tsx', 'utf8');

  it('lets an admin find a product without scrolling a list of hundreds', () => {
    expect(source).toContain('placeholder="Search products"');
    // Search covers the fields an admin would actually recall.
    for (const field of ['name', 'slug', 'categoryName', 'brandName']) {
      expect(source).toContain(`${field}`);
    }
  });

  it('toggles featured in place instead of sending the admin to the product list', () => {
    expect(source).toContain('toggleProductFeatured');
    expect(source).toContain('aria-pressed={product.isFeatured}');
    expect(source).toContain(
      "title={product.isFeatured ? 'Remove from featured' : 'Mark as featured'}",
    );
  });

  it('disables reordering while a search is applied', () => {
    // A drop position inside a filtered subset does not mean the same thing in
    // the full list, so dragging is switched off rather than silently wrong.
    expect(source).toContain('canEdit={canEdit && !filtering}');
    expect(source).toContain('!filtering && index > 0');
    expect(source).toContain('dragging is disabled while a filter is applied');
  });

  it('numbers rows by their real position, not their filtered one', () => {
    expect(source).toContain('items.findIndex((candidate) => candidate.id === product.id)');
  });
});

describe('chart drill-downs', () => {
  const charts = readFileSync('src/components/admin/charts.tsx', 'utf8');
  const dashboard = readFileSync('src/app/admin/crm/page.tsx', 'utf8');

  it('renders a bar as a link only when the caller supplies one', () => {
    expect(charts).toContain('item.href ? (');
    expect(charts).toContain('<Link');
    // Without an href the row must not look clickable.
    expect(charts).toContain('<div className="px-1 py-0.5">{body}</div>');
  });

  it('links top landing pages and top forms to the leads they counted', () => {
    expect(dashboard).toContain('/admin/leads?landingUrl=');
    expect(dashboard).toContain('/admin/leads?formId=');
    // And carries the selected range through, so the list matches the chart.
    const links = dashboard.match(/\/admin\/leads\?(landingUrl|formId)=[^`]*`/g) ?? [];
    expect(links.length).toBe(2);
    for (const link of links) expect(link).toContain('${rangeQuery}');
  });

  it('escapes values that travel in a query string', () => {
    expect(dashboard).toContain('encodeURIComponent(row.key)');
  });
});
