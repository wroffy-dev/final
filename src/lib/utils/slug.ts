import slugifyLib from 'slugify';

export function slugify(input: string): string {
  return slugifyLib(input, { lower: true, strict: true, trim: true });
}

/** Slug for CMS pages — allows nesting like "dropbox/business". Empty == homepage. */
export function pageSlug(input: string): string {
  const cleaned = input.trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned) return '';
  return cleaned
    .split('/')
    .filter(Boolean)
    .map((segment) => slugify(segment))
    .filter(Boolean)
    .join('/');
}

/** Appends -2, -3, ... until `exists` reports the slug as free. */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'item';
  let candidate = root;
  let n = 1;
  while (await exists(candidate)) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}
