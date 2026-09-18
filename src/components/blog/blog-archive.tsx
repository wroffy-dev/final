import { getBlogSections, getBlogSettings } from '@/lib/services/blog-cms';
import {
  listPosts,
  getBlogCategories,
  getBlogTags,
  categoryIdsWithChildren,
} from '@/lib/services/blog';
import { getWebsiteSettings } from '@/lib/services/settings';
import { parseBlockContent } from '@/lib/cms/blocks';
import type { BlogGridContent } from '@/lib/cms/blog-blocks';
import type { BlogRenderContext } from '@/lib/cms/blog-render';
import { SectionList } from '@/components/cms/section-renderer';
import type { CountryContext } from '@/lib/country/types';
import { BlogRoot } from './blog-root';

/**
 * The blog archive.
 *
 * `/blog`, a category archive and a tag archive are the same CMS-composed page
 * with a different filter, so they share this component: one section set to
 * maintain, one place to change, and a category archive that automatically
 * gains any section an admin adds to the blog.
 *
 * The paginated query runs here rather than inside the grid block, because the
 * pagination section may sit anywhere in the order — including above the grid —
 * and both need the same answer.
 */
export async function BlogArchive({
  country,
  basePath,
  categorySlug = null,
  categoryId = null,
  tagSlug = null,
  searchParams,
}: {
  /** The market whose articles this archive lists. */
  country: CountryContext;
  basePath: string;
  categorySlug?: string | null;
  categoryId?: string | null;
  tagSlug?: string | null;
  searchParams: { page?: string; q?: string; tag?: string };
}) {
  const [sections, settings, categories, tags, site] = await Promise.all([
    getBlogSections('LISTING'),
    getBlogSettings(),
    getBlogCategories(country.id),
    getBlogTags(country.id, 60),
    getWebsiteSettings(),
  ]);

  const query = (searchParams.q ?? '').trim();
  // `?tag=` predates the /blog/tag/[slug] archive and is still linked from
  // published articles, so it keeps working as a filter on /blog.
  const effectiveTagSlug = tagSlug ?? (searchParams.tag?.trim() || null);
  const page = Math.max(1, Number(searchParams.page) || 1);

  // The primary grid decides how many posts a page holds; the blog-wide
  // "posts per page" is the default when it has nothing to say.
  const primary = sections.find(
    (section) =>
      section.isVisible &&
      section.blockType === 'blogGrid' &&
      parseBlockContent<BlogGridContent>('blogGrid', section.content).paginate,
  );
  const perPage = settings.postsPerPage;

  const categoryIds = categoryId ? await categoryIdsWithChildren(categoryId) : undefined;

  const result = await listPosts({
    countryId: country.id,
    page,
    perPage,
    categoryIds,
    tagSlug: effectiveTagSlug ?? undefined,
    query: query || undefined,
    ...(primary
      ? (() => {
          const content = parseBlockContent<BlogGridContent>('blogGrid', primary.content);
          return {
            orderBy: content.orderBy,
            orderDir: content.orderDir,
            excludeIds: content.excludeIds,
            featuredOnly: content.source === 'featured',
          };
        })()
      : {}),
  });

  const blog: BlogRenderContext = {
    country,
    settings,
    archive: {
      basePath,
      query,
      categorySlug,
      tagSlug: effectiveTagSlug,
      page: result.page,
      pages: result.pages,
      total: result.total,
      posts: result.posts,
      searchParams: {
        q: query || undefined,
        // Only carry ?tag= on /blog; a tag archive has it in the path already.
        tag: tagSlug ? undefined : (effectiveTagSlug ?? undefined),
      },
      categories,
      tags,
    },
    article: null,
    socials: {
      siteName: site.siteName,
      linkedinUrl: site.linkedinUrl,
      twitterUrl: site.twitterUrl,
      facebookUrl: site.facebookUrl,
      instagramUrl: site.instagramUrl,
      youtubeUrl: site.youtubeUrl,
    },
  };

  return (
    <BlogRoot settings={settings}>
      <SectionList sections={sections} blog={blog} country={country} />
    </BlogRoot>
  );
}
