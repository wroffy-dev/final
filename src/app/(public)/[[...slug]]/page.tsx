import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveCountryPath } from '@/lib/country/registry';
import { contentSlug } from '@/lib/country/routing';
import { blogSlugExists } from '@/lib/services/blog';
import type { CountryContext } from '@/lib/country/types';
import { cmsPageMetadata, CmsPageSurface } from '../_surfaces/cms-page';
import {
  blogArchiveMetadata,
  BlogArchiveSurface,
  blogPostMetadata,
  BlogPostSurface,
  blogCategoryMetadata,
  BlogCategorySurface,
  blogTagMetadata,
  BlogTagSurface,
  type BlogSearchParams,
} from '../_surfaces/blog';
import { productMetadata, ProductSurface } from '../_surfaces/product';

type Params = { slug?: string[] };
type SearchParams = Promise<BlogSearchParams>;

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

/**
 * The public catch-all, for every market.
 *
 * The first path segment is matched against the configured market prefixes.
 * When it names an active market, that market owns the request and the rest of
 * the path is the content path; otherwise the whole path belongs to the root
 * market, which is what keeps the original single-country URLs working
 * untouched. The root market's own `/blog` and `/products` routes are more
 * specific than this catch-all and still win, so India's rendering path is
 * exactly what it always was.
 *
 * Adding Qatar needs nothing here: a `Country` row with slug `qa` is enough for
 * `/qa/…` to resolve.
 */

/** What a resolved public path actually is. */
type Surface =
  | { kind: 'page'; slug: string }
  | { kind: 'blog' }
  | { kind: 'post'; slug: string }
  | { kind: 'category'; slug: string }
  | { kind: 'tag'; slug: string }
  | { kind: 'product'; slug: string }
  | { kind: 'missing' };

function classify(segments: string[]): Surface {
  if (segments[0] === 'blog') {
    const [, second, third] = segments;
    if (segments.length === 1) return { kind: 'blog' };
    if (second === 'category') {
      return third && segments.length === 3 ? { kind: 'category', slug: third } : { kind: 'missing' };
    }
    if (second === 'tag') {
      return third && segments.length === 3 ? { kind: 'tag', slug: third } : { kind: 'missing' };
    }
    return second && segments.length === 2 ? { kind: 'post', slug: second } : { kind: 'missing' };
  }

  if (segments[0] === 'products') {
    const [, second] = segments;
    return second && segments.length === 2 ? { kind: 'product', slug: second } : { kind: 'missing' };
  }

  return { kind: 'page', slug: segments.join('/') };
}

/** Blog surfaces, which exist at the site root and nowhere else. */
const BLOG_SURFACES = new Set(['blog', 'post', 'category', 'tag']);

async function resolve(params: Params): Promise<{ country: CountryContext; surface: Surface }> {
  const requested = (params.slug ?? []).join('/');
  const { country, path } = await resolveCountryPath(`/${requested}`);
  const slug = contentSlug(path);
  const surface = classify(slug ? slug.split('/') : []);

  /*
   * A blog path under a market prefix is retired here.
   *
   * Articles are written once and are not per-market, so `/ae/blog/x` was a
   * second URL serving the same article — duplicate content competing with
   * `/blog/x` for its own ranking. These URLs existed, so they redirect rather
   * than disappear, permanently and only where the root actually has the
   * equivalent: a prefixed URL for an article that never existed is a 404, not
   * a redirect to an archive the visitor did not ask for.
   */
  if (!country.isDefault && BLOG_SURFACES.has(surface.kind)) {
    const target = await rootBlogEquivalent(surface);
    if (target) permanentRedirect(target);
    notFound();
  }

  return { country, surface };
}

/** The root URL for a blog surface, or null when the root has no equivalent. */
async function rootBlogEquivalent(surface: Surface): Promise<string | null> {
  switch (surface.kind) {
    case 'blog':
      return '/blog';
    case 'post':
      return (await blogSlugExists('post', surface.slug)) ? `/blog/${surface.slug}` : null;
    case 'category':
      return (await blogSlugExists('category', surface.slug))
        ? `/blog/category/${surface.slug}`
        : null;
    case 'tag':
      return (await blogSlugExists('tag', surface.slug)) ? `/blog/tag/${surface.slug}` : null;
    default:
      return null;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ country, surface }, query] = await Promise.all([resolve(await params), searchParams]);

  switch (surface.kind) {
    case 'blog':
      return blogArchiveMetadata(country, query);
    case 'post':
      return blogPostMetadata(country, surface.slug);
    case 'category':
      return blogCategoryMetadata(country, surface.slug, query);
    case 'tag':
      return blogTagMetadata(country, surface.slug, query);
    case 'product':
      return productMetadata(country, surface.slug);
    case 'page':
      return cmsPageMetadata(country, surface.slug);
    default:
      return { title: 'Page not found', robots: { index: false, follow: false } };
  }
}

export default async function PublicCatchAll({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: SearchParams;
}) {
  const [{ country, surface }, query] = await Promise.all([resolve(await params), searchParams]);

  switch (surface.kind) {
    case 'blog':
      return <BlogArchiveSurface country={country} searchParams={query} />;
    case 'post':
      return <BlogPostSurface country={country} slug={surface.slug} />;
    case 'category':
      return <BlogCategorySurface country={country} slug={surface.slug} searchParams={query} />;
    case 'tag':
      return <BlogTagSurface country={country} slug={surface.slug} searchParams={query} />;
    case 'product':
      return <ProductSurface country={country} slug={surface.slug} />;
    case 'page':
      return <CmsPageSurface country={country} slug={surface.slug} />;
    default:
      notFound();
  }
}
