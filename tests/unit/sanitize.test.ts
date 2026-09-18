import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText, safeUrl } from '@/lib/utils/sanitize';

describe('sanitizeHtml', () => {
  it('keeps ordinary formatting', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('removes script tags', () => {
    const output = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(output).not.toContain('script');
    expect(output).toContain('<p>hi</p>');
  });

  it('removes inline event handlers', () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
  });

  it('removes javascript: hrefs', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('removes iframes and forms', () => {
    const output = sanitizeHtml('<iframe src="https://evil.test"></iframe><form></form>');
    expect(output).not.toContain('iframe');
    expect(output).not.toContain('<form');
  });
});

describe('sanitizeText', () => {
  it('strips every tag', () => {
    expect(sanitizeText('<b>Bold</b> text')).toBe('Bold text');
  });
});

describe('safeUrl', () => {
  it('allows relative paths and anchors', () => {
    expect(safeUrl('/pricing')).toBe('/pricing');
    expect(safeUrl('#faq')).toBe('#faq');
  });

  it('allows http and https', () => {
    expect(safeUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('allows mailto and tel', () => {
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeUrl('tel:+911234567890')).toBe('tel:+911234567890');
  });

  it('rejects javascript: and data: urls', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects blank input', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
