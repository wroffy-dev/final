import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { publishedPageWhere } from '@/lib/services/pages';
import { publishedPostWhere } from '@/lib/services/blog';
import { listIndexableCountries } from '@/lib/country/registry';
import { countryPath } from '@/lib/country/routing';
import { siteUrl } from '@/lib/env';
import type { CountryContext } from '@/lib/country/types';

/**
 * The sitemaps.
 *
 * A root index pointing at one sitemap per market, plus a root-only blog
 * sitemap — because articles are not per-market and listing them under a
 * market prefix would advertise a URL that redirects.
 *
 * Everything listed is a URL a visitor can actually reach and a crawler is
 * actually invited to index: published, not soft-deleted, not noindex, in a
 * market that is both active and published. A draft imported by the content
 * sync therefore stays out until someone publishes it, which is the point of
 * importing as a draft.
 */

/** The protocol's ceiling. Split beyond this rather than emit an invalid file. */
export const MAX_URLS_PER_SITEMAP = 45_000;

export type SitemapUrl = {
  loc: string;
  lastmod: Date;
  changefreq?: string;
  priority?: number;
  /** Reciprocal alternates, only where a real equivalent is published. */
  alternates?: Array<{ hreflang: string; href: string }>;
};

export type SitemapChild = {
  /** The path segment in /sitemaps/<name>.xml. */
  name: string;
  label: string;
  lastmod: Date;
  count: number;
};

function base(): string {
  return siteUrl().replace(/\/$/, '');
}

/** XML text escaping. A slug can legitimately contain an ampersand. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The market-relative content of one market, as sitemap URLs. */
export async function countryUrls(country: CountryContext): Promise<SitemapUrl[]> {
  const origin = base();
  const [pages, products] = await Promise.all([
    prisma.page.findMany({
      where: { ...publishedPageWhere(), noIndex: false, countryId: country.id },
      select: { slug: true, updatedAt: true, isHomepage: true },
    }),
    prisma.productCountry.findMany({
      where: {
        countryId: country.id,
        deletedAt: null,
        noIndex: false,
        status: 'PUBLISHED',
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
        product: { deletedAt: null, noIndex: false },
      },
      select: { updatedAt: true, product: { select: { slug: true } } },
    }),
  ]);

  const url = (path: string) => `${origin}${countryPath(country, path)}`.replace(/\/$/, '') || origin;

  return [
    ...pages.map((page) => ({
      loc: url(page.slug),
      lastmod: page.updatedAt,
      changefreq: 'weekly',
      priority: page.isHomepage || page.slug === '' ? 1 : 0.8,
    })),
    ...products.map((row) => ({
      loc: url(`products/${row.product.slug}`),
      lastmod: row.updatedAt,
      changefreq: 'weekly',
      priority: 0.9,
    })),
  ];
}

/**
 * The blog, once, at the root.
 *
 * De-duplicated by slug: the same article stored against two markets is still
 * one URL, and listing it twice would be listing a duplicate.
 */
export async function blogUrls(): Promise<SitemapUrl[]> {
  const origin = base();
  const [settings, posts, categories, tags] = await Promise.all([
    prisma.blogSettings.findUnique({ where: { id: 'singleton' }, select: { noIndex: true } }),
    prisma.blogPost.findMany({
      where: { ...publishedPostWhere(), noIndex: false },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.blogCategory.findMany({
      where: { isActive: true, noIndex: false, posts: { some: publishedPostWhere() } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.blogTag.findMany({
      where: { isActive: true, noIndex: false, posts: { some: { post: publishedPostWhere() } } },
      select: { slug: true, updatedAt: true, createdAt: true },
    }),
  ]);

  if (settings?.noIndex) return [];

  const seen = new Set<string>();
  const urls: SitemapUrl[] = [
    {
      loc: `${origin}/blog`,
      lastmod: posts[0]?.updatedAt ?? new Date(),
      changefreq: 'daily',
      priority: 0.7,
    },
  ];

  for (const post of posts) {
    if (seen.has(post.slug)) continue;
    seen.add(post.slug);
    urls.push({
      loc: `${origin}/blog/${post.slug}`,
      lastmod: post.updatedAt,
      changefreq: 'monthly',
      priority: 0.6,
    });
  }
  for (const category of categories) {
    urls.push({
      loc: `${origin}/blog/category/${category.slug}`,
      lastmod: category.updatedAt,
      changefreq: 'weekly',
      priority: 0.5,
    });
  }
  for (const tag of tags) {
    urls.push({
      loc: `${origin}/blog/tag/${tag.slug}`,
      lastmod: tag.updatedAt ?? tag.createdAt,
      changefreq: 'weekly',
      priority: 0.4,
    });
  }
  return urls;
}

/**
 * Adds reciprocal hreflang to a market's page URLs.
 *
 * Only where a real equivalent is published in the other market: an alternate
 * pointing at a page that does not exist is worse than none, and a market that
 * has not been given a page yet must not have one claimed on its behalf.
 *
 * Nothing is canonicalised to India. Each market's page is its own canonical —
 * canonicalising every market to the root would tell search engines the other
 * markets are duplicates that need not be shown.
 */
export async function withAlternates(
  country: CountryContext,
  urls: SitemapUrl[],
): Promise<SitemapUrl[]> {
  const countries = await listIndexableCountries();
  if (countries.length < 2) return urls;

  const origin = base();
  const slugs = await prisma.page.findMany({
    where: { ...publishedPageWhere(), noIndex: false },
    select: { slug: true, countryId: true },
  });

  // slug → the markets that actually publish that page.
  const bySlug = new Map<string, Set<string>>();
  for (const page of slugs) {
    const set = bySlug.get(page.slug) ?? new Set<string>();
    set.add(page.countryId);
    bySlug.set(page.slug, set);
  }

  const prefixOf = (loc: string) => {
    const path = loc.slice(origin.length) || '/';
    const stripped = country.slug ? path.replace(new RegExp(`^/${country.slug}`), '') : path;
    return stripped.replace(/^\/+|\/+$/g, '');
  };

  return urls.map((url) => {
    const slug = prefixOf(url.loc);
    const owners = bySlug.get(slug);
    if (!owners || owners.size < 2) return url;

    const alternates = countries
      .filter((candidate) => owners.has(candidate.id))
      .map((candidate) => ({
        hreflang: candidate.locale,
        href: `${origin}${countryPath(candidate, slug)}`.replace(/\/$/, '') || origin,
      }));

    return alternates.length > 1 ? { ...url, alternates } : url;
  });
}

/** Serialises a urlset, escaping every value the database supplies. */
export function renderUrlset(urls: readonly SitemapUrl[]): string {
  const rows = urls
    .map((url) => {
      const parts = [`    <loc>${xmlEscape(url.loc)}</loc>`];
      parts.push(`    <lastmod>${url.lastmod.toISOString()}</lastmod>`);
      if (url.changefreq) parts.push(`    <changefreq>${url.changefreq}</changefreq>`);
      if (url.priority !== undefined) parts.push(`    <priority>${url.priority}</priority>`);
      for (const alternate of url.alternates ?? []) {
        parts.push(
          `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alternate.hreflang)}" href="${xmlEscape(alternate.href)}" />`,
        );
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    rows,
    '</urlset>',
    '',
  ].join('\n');
}

/** Serialises the index. */
export function renderIndex(children: readonly SitemapChild[]): string {
  const origin = base();
  const rows = children
    .map(
      (child) =>
        `  <sitemap>\n    <loc>${xmlEscape(`${origin}/sitemaps/${child.name}.xml`)}</loc>\n    <lastmod>${child.lastmod.toISOString()}</lastmod>\n  </sitemap>`,
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    rows,
    '</sitemapindex>',
    '',
  ].join('\n');
}

/**
 * Every child sitemap the index should list.
 *
 * A market with nothing published contributes no sitemap rather than an empty
 * one, and a market excluded in its settings contributes none at all.
 */
export async function sitemapChildren(): Promise<SitemapChild[]> {
  const countries = await listIndexableCountries();
  const excluded = await prisma.countrySettings.findMany({
    where: { excludeFromSitemap: true },
    select: { countryId: true },
  });
  const skip = new Set(excluded.map((row) => row.countryId));

  const children: SitemapChild[] = [];

  for (const country of countries) {
    if (skip.has(country.id)) continue;
    const urls = await countryUrls(country);
    if (urls.length === 0) continue;

    const newest = urls.reduce(
      (latest, url) => (url.lastmod > latest ? url.lastmod : latest),
      urls[0].lastmod,
    );
    // The root market's file is named "root" rather than "" so the URL is
    // readable; every other market uses its own prefix.
    const pages = Math.ceil(urls.length / MAX_URLS_PER_SITEMAP);
    for (let page = 0; page < pages; page += 1) {
      children.push({
        name: `${country.slug || 'root'}${page > 0 ? `-${page + 1}` : ''}`,
        label: country.name,
        lastmod: newest,
        count: Math.min(MAX_URLS_PER_SITEMAP, urls.length - page * MAX_URLS_PER_SITEMAP),
      });
    }
  }

  const blog = await blogUrls();
  if (blog.length > 0) {
    const newest = blog.reduce(
      (latest, url) => (url.lastmod > latest ? url.lastmod : latest),
      blog[0].lastmod,
    );
    children.push({ name: 'blog', label: 'Blog', lastmod: newest, count: blog.length });
  }

  return children;
}

/** Resolves a child sitemap name to its URLs, or null when there is no such file. */
export async function childUrls(name: string): Promise<SitemapUrl[] | null> {
  if (name === 'blog') return blogUrls();

  const match = /^(.*?)(?:-(\d+))?$/.exec(name);
  const slugPart = match?.[1] ?? name;
  const page = match?.[2] ? Number(match[2]) - 1 : 0;
  const slug = slugPart === 'root' ? '' : slugPart;

  const countries = await listIndexableCountries();
  const country = countries.find((candidate) => candidate.slug === slug);
  if (!country) return null;

  const settings = await prisma.countrySettings.findUnique({
    where: { countryId: country.id },
    select: { excludeFromSitemap: true },
  });
  if (settings?.excludeFromSitemap) return null;

  const all = await withAlternates(country, await countryUrls(country));
  const slice = all.slice(page * MAX_URLS_PER_SITEMAP, (page + 1) * MAX_URLS_PER_SITEMAP);
  return slice.length > 0 ? slice : null;
}
