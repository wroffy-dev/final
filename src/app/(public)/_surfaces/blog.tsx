import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { after } from 'next/server';
import {
  getPublishedPost,
  recordPostView,
  getCategoryBySlug,
  getTagBySlug,
  findLivePostCountries,
} from '@/lib/services/blog';
import { getBlogSettings } from '@/lib/services/blog-cms';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import { buildMetadata, absoluteCountryUrl } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { blogPostingSchema, countryBreadcrumbSchema } from '@/lib/seo/structured-data';
import { BlogArchive } from '@/components/blog/blog-archive';
import { BlogArticle } from '@/components/blog/blog-article';
import { blogPath, categoryPath, tagPath } from '@/lib/cms/blog-render';
import type { CountryContext } from '@/lib/country/types';

/**
 * Every blog surface, in one market.
 *
 * The archive, an article, a category archive and a tag archive all render
 * through here for both the root market and every prefixed market, so the blog
 * has one implementation rather than one per market.
 */

export type BlogSearchParams = { page?: string; q?: string; tag?: string };

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export async function blogArchiveMetadata(
  country: CountryContext,
  params: BlogSearchParams,
): Promise<Metadata> {
  const settings = await getBlogSettings();
  const page = Math.max(1, Number(params.page) || 1);

  return buildMetadata({
    title: settings.seoTitle || 'Blog',
    description:
      settings.seoDescription ||
      'Guides, migration playbooks and administration tips for teams running Dropbox.',
    path: '/blog',
    country,
    canonicalUrl: settings.canonicalUrl,
    // A search result or page 2+ is not a page to index — the articles
    // themselves are already indexed on their own URLs.
    noIndex: settings.noIndex || page > 1 || Boolean(params.q?.trim()),
    noFollow: settings.noFollow,
    ogTitle: settings.ogTitle,
    ogDescription: settings.ogDescription,
    ogImageUrl: settings.ogImageUrl,
  });
}

export async function BlogArchiveSurface({
  country,
  searchParams,
}: {
  country: CountryContext;
  searchParams: BlogSearchParams;
}) {
  return (
    <>
      <BlogArchive country={country} basePath={blogPath(country)} searchParams={searchParams} />
      <JsonLd
        data={countryBreadcrumbSchema(country, [
          { name: 'Home', path: '' },
          { name: 'Blog', path: 'blog' },
        ])}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

export async function blogPostMetadata(
  country: CountryContext,
  slug: string,
): Promise<Metadata> {
  const [post, alternates] = await Promise.all([
    getPublishedPost(country.id, slug),
    findLivePostCountries(slug),
  ]);
  if (!post) return { title: 'Article not found', robots: { index: false, follow: false } };

  return buildMetadata({
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    path: `/blog/${slug}`,
    country,
    alternateCountryIds: alternates,
    canonicalUrl: post.canonicalUrl,
    noIndex: post.noIndex,
    noFollow: post.noFollow,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImageUrl: post.ogImage?.url ?? post.featuredImage?.url ?? null,
    twitterImageUrl: post.twitterImage?.url ?? null,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authorName: post.author?.name ?? null,
  });
}

export async function BlogPostSurface({
  country,
  slug,
}: {
  country: CountryContext;
  slug: string;
}) {
  const post = await getPublishedPost(country.id, slug);
  if (!post) notFound();

  const [site, seo] = await Promise.all([getWebsiteSettings(), getSeoSettings()]);

  // The view counter feeds the "Popular posts" sources. It runs after the
  // response so a write can never delay or fail the page.
  after(() => recordPostView(post.id));

  return (
    <>
      <BlogArticle post={post} country={country} />

      <JsonLd
        data={[
          blogPostingSchema({
            title: post.title,
            description: post.seoDescription || post.excerpt,
            url: absoluteCountryUrl(country, `blog/${post.slug}`),
            locale: country.locale,
            imageUrl: post.featuredImage?.url ?? post.ogImage?.url ?? null,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            wordCount: post.content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length,
            keywords: post.tags.map(({ tag }) => tag.name),
            section: post.category?.name ?? null,
            author: post.author
              ? {
                  name: post.author.name,
                  jobTitle: post.author.jobTitle,
                  url: post.author.linkedinUrl || post.author.websiteUrl,
                }
              : null,
            organizationName: seo.organizationName || site.siteName,
            logoUrl: seo.organizationLogoUrl ?? site.logoUrl,
          }),
          countryBreadcrumbSchema(country, [
            { name: 'Home', path: '' },
            { name: 'Blog', path: 'blog' },
            ...(post.category
              ? [{ name: post.category.name, path: `blog/category/${post.category.slug}` }]
              : []),
            { name: post.title, path: `blog/${post.slug}` },
          ]),
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Category archive
// ---------------------------------------------------------------------------

export async function blogCategoryMetadata(
  country: CountryContext,
  slug: string,
  params: BlogSearchParams,
): Promise<Metadata> {
  const category = await getCategoryBySlug(slug, country.id);
  if (!category) return { title: 'Category not found', robots: { index: false, follow: false } };

  const page = Math.max(1, Number(params.page) || 1);
  // The market's own archive copy and SEO, when it has set any.
  const local = category.countries?.[0] ?? null;

  return buildMetadata({
    title:
      local?.seoTitle ||
      local?.archiveTitle ||
      category.seoTitle ||
      category.archiveTitle ||
      `${category.name} articles`,
    description:
      local?.seoDescription ||
      local?.archiveDescription ||
      category.seoDescription ||
      category.archiveDescription ||
      category.description,
    path: `/blog/category/${slug}`,
    country,
    canonicalUrl: local?.canonicalUrl || category.canonicalUrl,
    noIndex: (local?.noIndex ?? category.noIndex) || page > 1,
    noFollow: local?.noFollow ?? category.noFollow,
    ogTitle: local?.ogTitle || category.ogTitle,
    ogDescription: local?.ogDescription || category.ogDescription,
    ogImageUrl: category.ogImage?.url ?? category.bannerImage?.url ?? null,
  });
}

export async function BlogCategorySurface({
  country,
  slug,
  searchParams,
}: {
  country: CountryContext;
  slug: string;
  searchParams: BlogSearchParams;
}) {
  const category = await getCategoryBySlug(slug, country.id);
  if (!category) notFound();

  // A hidden category keeps its URL working for anyone who has it bookmarked;
  // it simply stops being advertised in the filters.
  await getBlogSettings();

  return (
    <>
      <BlogArchive
        country={country}
        basePath={categoryPath(country, slug)}
        categorySlug={slug}
        categoryId={category.id}
        searchParams={searchParams}
      />
      <JsonLd
        data={countryBreadcrumbSchema(country, [
          { name: 'Home', path: '' },
          { name: 'Blog', path: 'blog' },
          ...(category.parent
            ? [{ name: category.parent.name, path: `blog/category/${category.parent.slug}` }]
            : []),
          { name: category.name, path: `blog/category/${slug}` },
        ])}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tag archive
// ---------------------------------------------------------------------------

export async function blogTagMetadata(
  country: CountryContext,
  slug: string,
  params: BlogSearchParams,
): Promise<Metadata> {
  const tag = await getTagBySlug(slug);
  if (!tag) return { title: 'Tag not found', robots: { index: false, follow: false } };

  const page = Math.max(1, Number(params.page) || 1);

  return buildMetadata({
    title: tag.seoTitle || `${tag.name} articles`,
    description: tag.seoDescription || tag.description,
    path: `/blog/tag/${slug}`,
    country,
    canonicalUrl: tag.canonicalUrl,
    noIndex: tag.noIndex || page > 1,
  });
}

export async function BlogTagSurface({
  country,
  slug,
  searchParams,
}: {
  country: CountryContext;
  slug: string;
  searchParams: BlogSearchParams;
}) {
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  return (
    <>
      <BlogArchive
        country={country}
        basePath={tagPath(country, slug)}
        tagSlug={slug}
        searchParams={searchParams}
      />
      <JsonLd
        data={countryBreadcrumbSchema(country, [
          { name: 'Home', path: '' },
          { name: 'Blog', path: 'blog' },
          { name: tag.name, path: `blog/tag/${slug}` },
        ])}
      />
    </>
  );
}
