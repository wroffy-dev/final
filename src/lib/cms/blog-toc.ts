import { slugify } from '@/lib/utils/slug';

/**
 * Table of contents built from the article body.
 *
 * The headings an author actually wrote are the outline — asking them to
 * maintain a second list would go stale immediately — so the TOC is derived,
 * and the same pass stamps a stable anchor onto each heading so the links have
 * something to point at.
 *
 * It runs over HTML that has already been through `sanitizeHtml`, and it only
 * ever adds an `id` attribute, so it cannot reintroduce anything the sanitiser
 * removed.
 */

export type TocItem = { id: string; text: string; level: 2 | 3 };

const HEADING = /<(h2|h3)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const EXISTING_ID = /\bid\s*=\s*["']([^"']+)["']/i;

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function buildTableOfContents(
  html: string,
  options: { includeH3?: boolean } = {},
): { html: string; items: TocItem[] } {
  if (!html) return { html: '', items: [] };

  const includeH3 = options.includeH3 !== false;
  const items: TocItem[] = [];
  const used = new Set<string>();

  const next = html.replace(HEADING, (match, tag: string, attrs: string, inner: string) => {
    const level = tag.toLowerCase() === 'h2' ? 2 : 3;
    const text = plainText(inner);
    if (!text) return match;

    const existing = EXISTING_ID.exec(attrs);
    let id = existing ? slugify(existing[1] ?? '') : slugify(text);
    if (!id) id = `section-${items.length + 1}`;

    // Two headings with the same words must not produce the same anchor.
    let candidate = id;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${id}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);

    if (level === 2 || includeH3) {
      items.push({ id: candidate, text, level: level as 2 | 3 });
    }

    const attrsWithoutId = attrs.replace(EXISTING_ID, '').trim();
    const rebuilt = `<${tag} id="${escapeAttribute(candidate)}"${attrsWithoutId ? ` ${attrsWithoutId}` : ''}>${inner}</${tag}>`;
    return rebuilt;
  });

  return { html: next, items };
}
