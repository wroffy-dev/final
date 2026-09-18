'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { blockDefaults, getBlock } from '@/lib/cms/blocks';
import { parseSectionDesign, DEFAULT_SECTION_DESIGN } from '@/lib/cms/design';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { listActiveCountries } from '@/lib/country/registry';
import { countryPath } from '@/lib/country/routing';

/**
 * The product builder's Server Actions.
 *
 * A deliberate mirror of the page section actions in `pages.ts`: same block
 * registry, same design parsing, same anchor rules, same ordering scheme. The
 * two are kept as separate modules rather than one generic helper because the
 * records they guard differ in the way that matters — a page belongs to one
 * market and is checked against the editor's market access, while a product is
 * a single global row and is not.
 *
 * That difference is the whole reason product sections need no country
 * argument: the sections are authored once and rendered in every market, with
 * their internal links localised at the render boundary.
 */

const sectionOrderSchema = z.object({
  productId: z.string().min(1),
  order: z.array(z.string().min(1)).max(200),
});

/**
 * Revalidates the product's page in every market that could be serving it.
 *
 * Identical reasoning to `revalidateProduct` in `products.ts`: the catalogue is
 * global but the URLs are not, so touching `/products/x` alone would leave
 * `/ae/products/x` stale.
 */
async function revalidateProductSections(slug: string) {
  const countries = await listActiveCountries();
  for (const country of countries) {
    revalidatePath(countryPath(country, `products/${slug}`));
  }
  revalidatePath('/sitemap.xml');
}

export async function addProductSection(
  productId: string,
  blockType: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.edit');
    const definition = getBlock(blockType);
    if (!definition) return failure('Unknown block type.');

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true, deletedAt: true },
    });
    if (!product || product.deletedAt) return failure('That product no longer exists.');

    const last = await prisma.productSection.findFirst({
      where: { productId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const section = await prisma.productSection.create({
      data: {
        productId,
        blockType,
        name: definition.label,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        content: blockDefaults(blockType) as object,
        settings: DEFAULT_SECTION_DESIGN as unknown as object,
      },
    });

    await recordAudit({
      actor: user,
      action: 'section.added',
      entity: 'Product',
      entityId: productId,
      summary: `Added a ${definition.label} section`,
    });

    revalidatePath(`/admin/products/${productId}`);
    await revalidateProductSections(product.slug);
    return success({ id: section.id }, `${definition.label} added.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateProductSection(
  sectionId: string,
  payload: { content?: unknown; settings?: unknown; name?: string | null; isVisible?: boolean },
): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');

    const section = await prisma.productSection.findUnique({
      where: { id: sectionId },
      include: { product: { select: { id: true, slug: true } } },
    });
    if (!section) return failure('That section no longer exists.');

    const definition = getBlock(section.blockType);
    const data: Record<string, unknown> = {};

    if (payload.content !== undefined && definition) {
      // Validate against the block's own schema so stored content always parses.
      data.content = definition.schema.parse(payload.content);
    }
    if (payload.settings !== undefined) {
      // parseSectionDesign never throws — it upgrades the original settings
      // shape and falls back to defaults — so a half-saved panel can't 500.
      const design = parseSectionDesign(payload.settings);

      // Anchor IDs address a single element, so they must be unique per product.
      if (design.anchorId) {
        const siblings = await prisma.productSection.findMany({
          where: { productId: section.product.id, id: { not: sectionId } },
          select: { settings: true },
        });
        const taken = siblings.some(
          (s) => parseSectionDesign(s.settings).anchorId === design.anchorId,
        );
        if (taken) {
          return failure(
            `Another section on this product already uses the anchor “${design.anchorId}”.`,
            { anchorId: ['This anchor is already used on this product'] },
          );
        }
      }

      data.settings = design as unknown as object;
    }
    if (payload.name !== undefined) data.name = payload.name ? sanitizeText(payload.name) : null;
    if (payload.isVisible !== undefined) data.isVisible = payload.isVisible;

    await prisma.productSection.update({ where: { id: sectionId }, data });
    await prisma.product.update({
      where: { id: section.product.id },
      data: { updatedById: user.id },
    });

    revalidatePath(`/admin/products/${section.product.id}`);
    await revalidateProductSections(section.product.slug);
    return success(undefined, 'Section saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateProductSection(
  sectionId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await authorize('products.edit');
    const source = await prisma.productSection.findUnique({
      where: { id: sectionId },
      include: { product: { select: { id: true, slug: true } } },
    });
    if (!source) return failure('That section no longer exists.');

    // The copy keeps every design value except the anchor: two elements cannot
    // share one DOM id, and silently duplicating it would break #links.
    const design = parseSectionDesign(source.settings);

    const copy = await prisma.productSection.create({
      data: {
        productId: source.productId,
        blockType: source.blockType,
        name: source.name ? `${source.name} (copy)` : null,
        sortOrder: source.sortOrder + 5,
        isVisible: source.isVisible,
        content: source.content as object,
        settings: { ...design, anchorId: '' } as unknown as object,
      },
    });

    await normaliseOrder(source.productId);
    revalidatePath(`/admin/products/${source.product.id}`);
    await revalidateProductSections(source.product.slug);
    return success({ id: copy.id }, 'Section duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteProductSection(sectionId: string): Promise<ActionResult> {
  try {
    await authorize('products.edit');
    const section = await prisma.productSection.findUnique({
      where: { id: sectionId },
      include: { product: { select: { id: true, slug: true } } },
    });
    if (!section) return failure('That section no longer exists.');

    await prisma.productSection.delete({ where: { id: sectionId } });
    revalidatePath(`/admin/products/${section.product.id}`);
    await revalidateProductSections(section.product.slug);
    return success(undefined, 'Section removed.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function reorderProductSections(input: unknown): Promise<ActionResult> {
  try {
    await authorize('products.edit');
    const { productId, order } = sectionOrderSchema.parse(input);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true, deletedAt: true },
    });
    if (!product || product.deletedAt) return failure('That product no longer exists.');

    // Reject ids that do not belong to this product.
    const owned = await prisma.productSection.findMany({
      where: { productId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));
    if (order.some((id) => !ownedIds.has(id))) return failure('Invalid section order.');

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.productSection.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } }),
      ),
    );

    revalidatePath(`/admin/products/${productId}`);
    await revalidateProductSections(product.slug);
    return success(undefined, 'Order saved.');
  } catch (error) {
    return toActionError(error);
  }
}

async function normaliseOrder(productId: string) {
  const sections = await prisma.productSection.findMany({
    where: { productId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    sections.map((section, index) =>
      prisma.productSection.update({
        where: { id: section.id },
        data: { sortOrder: (index + 1) * 10 },
      }),
    ),
  );
}

export async function toggleProductSectionVisibility(sectionId: string): Promise<ActionResult> {
  try {
    await authorize('products.edit');
    const section = await prisma.productSection.findUnique({
      where: { id: sectionId },
      include: { product: { select: { id: true, slug: true } } },
    });
    if (!section) return failure('That section no longer exists.');

    await prisma.productSection.update({
      where: { id: sectionId },
      data: { isVisible: !section.isVisible },
    });

    revalidatePath(`/admin/products/${section.product.id}`);
    await revalidateProductSections(section.product.slug);
    return success(undefined, section.isVisible ? 'Section hidden.' : 'Section shown.');
  } catch (error) {
    return toActionError(error);
  }
}
