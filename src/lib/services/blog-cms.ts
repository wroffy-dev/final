import 'server-only';
import { cache } from 'react';
import type { BlogSurface } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  parseBlogCard,
  parseBlogLayout,
  parseBlogShare,
  parseBlogTypography,
  type ResolvedBlogSettings,
  DEFAULT_BLOG_SETTINGS,
} from '@/lib/cms/blog-settings';
import { synthesiseSections } from '@/lib/cms/blog-defaults';

/**
 * Blog CMS reads.
 *
 * The blog's structure lives in `BlogSection` rows and its presentation in the
 * `BlogSettings` singleton. Both have a code-level fallback so a site that has
 * never opened the blog builder still renders a complete, sensible blog — and
 * so the first save is an ordinary edit rather than a migration.
 */

export type RenderableSection = {
  id: string;
  blockType: string;
  content: unknown;
  settings: unknown;
  isVisible: boolean;
  sortOrder: number;
};

/**
 * The blog's design settings, already parsed.
 *
 * Reads never write: a missing singleton resolves to the defaults rather than
 * creating a row, so rendering a public page cannot touch the database beyond
 * the read it needs.
 */
export const getBlogSettings = cache(async (): Promise<ResolvedBlogSettings> => {
  const row = await prisma.blogSettings.findUnique({
    where: { id: 'singleton' },
    include: { ogImage: { select: { url: true } } },
  });
  if (!row) return DEFAULT_BLOG_SETTINGS;

  return {
    postsPerPage: Math.min(Math.max(row.postsPerPage, 1), 48),
    card: parseBlogCard(row.cardSettings),
    layout: parseBlogLayout(row.layoutSettings),
    share: parseBlogShare(row.shareSettings),
    typography: parseBlogTypography(row.typography),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    ogImageUrl: row.ogImage?.url ?? null,
    noIndex: row.noIndex,
    noFollow: row.noFollow,
  };
});

/**
 * One surface's sections, in order.
 *
 * `postId` selects a post's own sidebar; passing null (the default) reads the
 * global set. An empty result falls back to the built-in arrangement so the
 * public blog is never blank.
 */
export const getBlogSections = cache(
  async (surface: BlogSurface, postId: string | null = null): Promise<RenderableSection[]> => {
    const rows = await prisma.blogSection.findMany({
      where: { surface, postId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        blockType: true,
        content: true,
        settings: true,
        isVisible: true,
        sortOrder: true,
      },
    });

    if (rows.length > 0) return rows;
    // A post-specific set that is empty means "this post has no widgets", not
    // "fall back to the defaults" — only the global sets synthesise.
    if (postId) return [];
    return synthesiseSections(surface);
  },
);

/** Admin read: the raw rows for a surface, without the code-level fallback. */
export async function getBlogSectionRows(surface: BlogSurface, postId: string | null = null) {
  return prisma.blogSection.findMany({
    where: { surface, postId },
    orderBy: { sortOrder: 'asc' },
  });
}

/**
 * Ensures a surface has real rows, copying the built-in arrangement on first
 * use.
 *
 * Called from the admin builder, never from a public page: the first time an
 * administrator opens a surface they get the arrangement they have been
 * looking at, as editable rows, rather than an empty screen.
 */
export async function materialiseSurface(
  surface: BlogSurface,
  postId: string | null = null,
): Promise<void> {
  const existing = await prisma.blogSection.count({ where: { surface, postId } });
  if (existing > 0) return;
  if (postId) return;

  const seeds = synthesiseSections(surface);
  await prisma.blogSection.createMany({
    data: seeds.map((seed) => ({
      surface,
      postId: null,
      blockType: seed.blockType,
      name: seed.name,
      sortOrder: seed.sortOrder,
      isVisible: seed.isVisible,
      content: seed.content as object,
      settings: seed.settings as object,
    })),
  });
}

/**
 * The widget list for one article.
 *
 * A post either follows the global sidebar, brings its own, or has none. The
 * decision is made here so the article route never has to know the rules.
 */
export async function getSidebarForPost(post: {
  id: string;
  sidebarMode: 'GLOBAL' | 'CUSTOM' | 'NONE';
}): Promise<RenderableSection[]> {
  if (post.sidebarMode === 'NONE') return [];
  if (post.sidebarMode === 'CUSTOM') {
    const own = await getBlogSections('SIDEBAR', post.id);
    // A post switched to "custom" before any widget was added would otherwise
    // render an empty column; the global sidebar is the safer fallback.
    return own.length > 0 ? own : getBlogSections('SIDEBAR', null);
  }
  return getBlogSections('SIDEBAR', null);
}
