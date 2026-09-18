'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { BlogSurface } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { authorizeAny } from '@/lib/auth/guards';
import type { PermissionKey } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/services/audit';
import { blockDefaults, getBlock } from '@/lib/cms/blocks';
import { parseSectionDesign, DEFAULT_SECTION_DESIGN } from '@/lib/cms/design';
import {
  blogCardSchema,
  blogLayoutSchema,
  blogShareSchema,
  blogTypographySchema,
} from '@/lib/cms/blog-settings';
import { materialiseSurface } from '@/lib/services/blog-cms';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { revalidateAllCountryBlogs } from '@/lib/country/revalidate';

/**
 * Blog structure and design actions.
 *
 * Deliberately a mirror of the page-section actions: same validation through
 * the block registry, same design parsing, same audit trail. The blog's
 * sections are `BlogSection` rows rather than `PageSection` rows only because
 * they hang off a surface instead of a page — everything else is shared.
 */

const surfaceSchema = z.nativeEnum(BlogSurface);

/** Permissions that may edit each surface, newest first, legacy last. */
const SURFACE_PERMISSIONS: Record<BlogSurface, PermissionKey[]> = {
  LISTING: ['blog.sections', 'blog.edit'],
  ARTICLE: ['blog.sections', 'blog.edit'],
  SIDEBAR: ['blog.sidebar', 'blog.edit'],
};

async function revalidateBlog() {
  // The blog's arrangement and design are global, so every market's blog is
  // affected — not just the root market's.
  await revalidateAllCountryBlogs();
  revalidatePath('/admin/blog/layout');
  revalidatePath('/admin/blog/design');
}

/** A section may only be added to a surface whose picker offers it. */
function surfaceKey(surface: BlogSurface) {
  return surface === 'LISTING' ? 'blogListing' : surface === 'ARTICLE' ? 'blogArticle' : 'blogSidebar';
}

async function loadSection(sectionId: string) {
  return prisma.blogSection.findUnique({ where: { id: sectionId } });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function ensureBlogSurface(rawSurface: unknown): Promise<ActionResult> {
  try {
    const surface = surfaceSchema.parse(rawSurface);
    await authorizeAny(SURFACE_PERMISSIONS[surface]);
    await materialiseSurface(surface, null);
    await revalidateBlog();
    return success(undefined, 'Ready.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function addBlogSection(input: {
  surface: BlogSurface;
  postId?: string | null;
  blockType: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const surface = surfaceSchema.parse(input.surface);
    const user = await authorizeAny(SURFACE_PERMISSIONS[surface]);

    const definition = getBlock(input.blockType);
    if (!definition) return failure('Unknown block type.');
    if (!(definition.surfaces ?? ['page']).includes(surfaceKey(surface))) {
      return failure('That block cannot be added here.');
    }

    const postId = input.postId ?? null;
    if (postId) {
      const post = await prisma.blogPost.findFirst({
        where: { id: postId, deletedAt: null },
        select: { id: true },
      });
      if (!post) return failure('That post no longer exists.');
    }

    // A singleton block is part of the surface's anatomy — one header, one
    // content area — so adding a second is rejected rather than silently
    // producing a duplicate article body.
    if (definition.singleton) {
      const existing = await prisma.blogSection.count({
        where: { surface, postId, blockType: input.blockType },
      });
      if (existing > 0) {
        return failure(`“${definition.label}” is already on this layout.`);
      }
    }

    const last = await prisma.blogSection.findFirst({
      where: { surface, postId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const section = await prisma.blogSection.create({
      data: {
        surface,
        postId,
        blockType: input.blockType,
        name: definition.label,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        content: blockDefaults(input.blockType) as object,
        settings: DEFAULT_SECTION_DESIGN as unknown as object,
      },
    });

    await recordAudit({
      actor: user,
      action: 'blog.section.added',
      entity: 'BlogSection',
      entityId: section.id,
      summary: `Added a ${definition.label} to the blog ${surface.toLowerCase()}`,
    });

    await revalidateBlog();
    return success({ id: section.id }, `${definition.label} added.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateBlogSection(
  sectionId: string,
  payload: { content?: unknown; settings?: unknown; name?: string | null; isVisible?: boolean },
): Promise<ActionResult> {
  try {
    const section = await loadSection(sectionId);
    if (!section) return failure('That section no longer exists.');
    await authorizeAny(SURFACE_PERMISSIONS[section.surface]);

    const definition = getBlock(section.blockType);
    const data: Record<string, unknown> = {};

    if (payload.content !== undefined && definition) {
      data.content = definition.schema.parse(payload.content);
    }
    if (payload.settings !== undefined) {
      const design = parseSectionDesign(payload.settings);

      if (design.anchorId) {
        const siblings = await prisma.blogSection.findMany({
          where: { surface: section.surface, postId: section.postId, id: { not: sectionId } },
          select: { settings: true },
        });
        const taken = siblings.some(
          (row) => parseSectionDesign(row.settings).anchorId === design.anchorId,
        );
        if (taken) {
          return failure(`Another section already uses the anchor “${design.anchorId}”.`, {
            anchorId: ['This anchor is already used on this layout'],
          });
        }
      }

      data.settings = design as unknown as object;
    }
    if (payload.name !== undefined) data.name = payload.name ? sanitizeText(payload.name) : null;
    if (payload.isVisible !== undefined) data.isVisible = payload.isVisible;

    await prisma.blogSection.update({ where: { id: sectionId }, data });
    await revalidateBlog();
    if (section.postId) revalidatePath(`/admin/blog/${section.postId}`);
    return success(undefined, 'Section saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateBlogSection(
  sectionId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const source = await loadSection(sectionId);
    if (!source) return failure('That section no longer exists.');
    await authorizeAny(SURFACE_PERMISSIONS[source.surface]);

    const definition = getBlock(source.blockType);
    if (definition?.singleton) {
      return failure(`“${definition.label}” can only appear once, so it cannot be duplicated.`);
    }

    // The copy keeps every design value except the anchor: two elements cannot
    // share one DOM id.
    const design = parseSectionDesign(source.settings);

    const copy = await prisma.blogSection.create({
      data: {
        surface: source.surface,
        postId: source.postId,
        blockType: source.blockType,
        name: source.name ? `${source.name} (copy)` : null,
        sortOrder: source.sortOrder + 5,
        isVisible: source.isVisible,
        content: source.content as object,
        settings: { ...design, anchorId: '' } as unknown as object,
      },
    });

    await normaliseOrder(source.surface, source.postId);
    await revalidateBlog();
    return success({ id: copy.id }, 'Section duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBlogSection(sectionId: string): Promise<ActionResult> {
  try {
    const section = await loadSection(sectionId);
    if (!section) return failure('That section no longer exists.');
    await authorizeAny(SURFACE_PERMISSIONS[section.surface]);

    await prisma.blogSection.delete({ where: { id: sectionId } });
    await revalidateBlog();
    if (section.postId) revalidatePath(`/admin/blog/${section.postId}`);
    return success(undefined, 'Section removed.');
  } catch (error) {
    return toActionError(error);
  }
}

const reorderSchema = z.object({
  surface: surfaceSchema,
  postId: z.string().max(40).nullable().default(null),
  order: z.array(z.string().min(1)).max(200),
});

export async function reorderBlogSections(input: unknown): Promise<ActionResult> {
  try {
    const { surface, postId, order } = reorderSchema.parse(input);
    await authorizeAny(SURFACE_PERMISSIONS[surface]);

    // Reject ids that do not belong to this surface.
    const owned = await prisma.blogSection.findMany({
      where: { surface, postId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((row) => row.id));
    if (order.some((id) => !ownedIds.has(id))) return failure('Invalid section order.');

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.blogSection.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } }),
      ),
    );

    await revalidateBlog();
    if (postId) revalidatePath(`/admin/blog/${postId}`);
    return success(undefined, 'Order saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleBlogSectionVisibility(sectionId: string): Promise<ActionResult> {
  try {
    const section = await loadSection(sectionId);
    if (!section) return failure('That section no longer exists.');
    await authorizeAny(SURFACE_PERMISSIONS[section.surface]);

    await prisma.blogSection.update({
      where: { id: sectionId },
      data: { isVisible: !section.isVisible },
    });

    await revalidateBlog();
    return success(undefined, section.isVisible ? 'Section hidden.' : 'Section shown.');
  } catch (error) {
    return toActionError(error);
  }
}

async function normaliseOrder(surface: BlogSurface, postId: string | null) {
  const rows = await prisma.blogSection.findMany({
    where: { surface, postId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    rows.map((row, index) =>
      prisma.blogSection.update({ where: { id: row.id }, data: { sortOrder: (index + 1) * 10 } }),
    ),
  );
}

/**
 * Copies the global sidebar onto one post as a starting point for its override.
 *
 * Building a bespoke sidebar from scratch is rarely what an admin wants; they
 * want the normal one with two things changed.
 */
export async function copyGlobalSidebarToPost(postId: string): Promise<ActionResult> {
  try {
    await authorizeAny(['blog.sidebar', 'blog.edit']);
    const post = await prisma.blogPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });
    if (!post) return failure('That post no longer exists.');

    const existing = await prisma.blogSection.count({
      where: { surface: 'SIDEBAR', postId },
    });
    if (existing > 0) return failure('This article already has its own sidebar.');

    await materialiseSurface('SIDEBAR', null);
    const global = await prisma.blogSection.findMany({
      where: { surface: 'SIDEBAR', postId: null },
      orderBy: { sortOrder: 'asc' },
    });

    if (global.length === 0) return failure('There is no global sidebar to copy yet.');

    await prisma.blogSection.createMany({
      data: global.map((row) => ({
        surface: BlogSurface.SIDEBAR,
        postId,
        blockType: row.blockType,
        name: row.name,
        sortOrder: row.sortOrder,
        isVisible: row.isVisible,
        content: row.content as object,
        settings: { ...parseSectionDesign(row.settings), anchorId: '' } as unknown as object,
      })),
    });

    revalidatePath(`/admin/blog/${postId}`);
    await revalidateBlog();
    return success(undefined, 'Global sidebar copied. Edit it freely — the global one is untouched.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function clearPostSidebar(postId: string): Promise<ActionResult> {
  try {
    await authorizeAny(['blog.sidebar', 'blog.edit']);
    await prisma.blogSection.deleteMany({ where: { surface: 'SIDEBAR', postId } });
    revalidatePath(`/admin/blog/${postId}`);
    await revalidateBlog();
    return success(undefined, 'Custom sidebar removed. This article follows the global one again.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Design settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  postsPerPage: z.coerce.number().int().min(1).max(48).default(9),
  card: blogCardSchema,
  layout: blogLayoutSchema,
  share: blogShareSchema,
  typography: blogTypographySchema,
  seoTitle: z.string().max(240).nullable().default(null),
  seoDescription: z.string().max(400).nullable().default(null),
  canonicalUrl: z.string().max(500).nullable().default(null),
  ogTitle: z.string().max(240).nullable().default(null),
  ogDescription: z.string().max(400).nullable().default(null),
  ogImageId: z.string().max(40).nullable().default(null),
  noIndex: z.coerce.boolean().default(false),
  noFollow: z.coerce.boolean().default(false),
});

export async function saveBlogSettings(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorizeAny(['blog.design', 'blog.edit']);
    const parsed = settingsSchema.parse(input);

    const clean = (value: string | null) => {
      const text = sanitizeText(value ?? '');
      return text ? text : null;
    };

    const data = {
      postsPerPage: parsed.postsPerPage,
      cardSettings: parsed.card as unknown as object,
      layoutSettings: parsed.layout as unknown as object,
      shareSettings: parsed.share as unknown as object,
      typography: parsed.typography as unknown as object,
      seoTitle: clean(parsed.seoTitle),
      seoDescription: clean(parsed.seoDescription),
      canonicalUrl: clean(parsed.canonicalUrl),
      ogTitle: clean(parsed.ogTitle),
      ogDescription: clean(parsed.ogDescription),
      ogImageId: parsed.ogImageId || null,
      noIndex: parsed.noIndex,
      noFollow: parsed.noFollow,
    };

    await prisma.blogSettings.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'BlogSettings',
      entityId: 'singleton',
      summary: 'Updated blog design settings',
    });

    await revalidateBlog();
    return success(undefined, 'Blog design saved.');
  } catch (error) {
    return toActionError(error);
  }
}
