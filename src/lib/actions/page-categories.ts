'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { pageCategorySchema, pageCategoryOrderSchema } from '@/lib/validation/page';
import { canSetParent } from '@/lib/utils/tree';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { scopeForUser } from '@/lib/country/admin';
import { offerIn, removeFrom } from '@/lib/country/availability';

const PARENT_LABELS = {
  self: 'A category cannot be its own parent.',
  cycle: 'That would place a category inside one of its own subcategories.',
  missing: 'That parent category no longer exists.',
};

/** Every category, for cycle checking. Small table, so one read is cheap. */
async function loadTree() {
  return prisma.pageCategory.findMany({ select: { id: true, parentId: true } });
}

export async function savePageCategory(
  categoryId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('pages.edit');

    const input = pageCategorySchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      parentId: formData.get('parentId'),
      sortOrder: formData.get('sortOrder') || 0,
    });

    // A category may not sit inside itself or inside its own descendants —
    // that makes every recursive read (tree, breadcrumbs) loop forever.
    const parentCheck = canSetParent(await loadTree(), categoryId, input.parentId, PARENT_LABELS);
    if (!parentCheck.ok) return failure(parentCheck.error);

    // Slugs are unique. A new one is de-duplicated automatically; an edited one
    // is checked so the admin is told rather than silently renamed.
    let slug = input.slug || slugify(input.name);
    if (categoryId === null) {
      slug = await uniqueSlug(slug, async (candidate) => {
        const existing = await prisma.pageCategory.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return Boolean(existing);
      });
    } else {
      const clash = await prisma.pageCategory.findFirst({
        where: { slug, NOT: { id: categoryId } },
        select: { id: true },
      });
      if (clash) return failure('Another category already uses that URL slug.');
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      parentId: input.parentId,
      sortOrder: input.sortOrder,
    };

    const category = categoryId
      ? await prisma.pageCategory.update({ where: { id: categoryId }, data })
      : await prisma.pageCategory.create({ data });

    // Offered in the market it was created in. An edit must not re-offer a
    // category this market had removed, so this is create-only.
    if (!categoryId) {
      const scope = await scopeForUser(user);
      await offerIn('PAGE_CATEGORY', [category.id], scope.country.id);
    }

    await recordAudit({
      actor: user,
      action: categoryId ? 'updated' : 'created',
      entity: 'PageCategory',
      entityId: category.id,
      summary: `${categoryId ? 'Updated' : 'Created'} page category “${category.name}”`,
    });

    revalidatePath('/admin/pages/categories');
    revalidatePath('/admin/pages');
    return success({ id: category.id }, 'Category saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const deleteSchema = z.object({
  categoryId: z.string().min(1),
  /** Where the category's pages go. Omitted or empty means uncategorised. */
  movePagesTo: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

/**
 * Deletes a category. Its pages are never deleted with it — they are moved to
 * the chosen category, or left uncategorised. Child categories are promoted to
 * the level the deleted category occupied rather than orphaned.
 */
export async function deletePageCategory(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('pages.delete');
    const { categoryId, movePagesTo } = deleteSchema.parse(input);

    const category = await prisma.pageCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { pages: true, children: true } } },
    });
    if (!category) return failure('That category no longer exists.');

    if (movePagesTo) {
      if (movePagesTo === categoryId)
        return failure('Choose a different category to move pages to.');
      const target = await prisma.pageCategory.findUnique({
        where: { id: movePagesTo },
        select: { id: true },
      });
      if (!target) return failure('That destination category no longer exists.');
    }

    const scope = await scopeForUser(user);

    /*
     * This market's pages are recategorised, and this market stops offering the
     * category. The category row itself is shared, so deleting it here would
     * take it away from every other market too — which is what this used to do.
     *
     * Only when no market offers it any more is the shared row removed, and
     * only then do subcategories need promoting: until that point the tree is
     * still in use somewhere.
     */
    /*
     * The pages move **first**.
     *
     * If the category turns out to be unused and gets deleted, the schema's
     * SET NULL takes every page's category with it — so a move that ran
     * afterwards would find nothing left to move and quietly leave the pages
     * uncategorised, which is precisely what the administrator asked not to
     * happen.
     *
     * Scoped to this market, so another market's pages keep their category.
     */
    const moved = await prisma.page.updateMany({
      where: { categoryId, countryId: scope.country.id },
      data: { categoryId: movePagesTo },
    });

    const outcome = await removeFrom('PAGE_CATEGORY', categoryId, scope.country.id, {
      retireWhenUnused: async (tx) => {
        await tx.pageCategory.updateMany({
          where: { parentId: categoryId },
          data: { parentId: category.parentId },
        });
        await tx.pageCategory.delete({ where: { id: categoryId } });
      },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'PageCategory',
      entityId: categoryId,
      summary:
        `Removed page category “${category.name}” from ${scope.country.name} — ${moved.count} page(s) ` +
        `${movePagesTo ? 'moved to another category' : 'left uncategorised'}` +
        (outcome.retired
          ? `; no market used it, so it was deleted and ${category._count.children} subcategory(ies) were promoted`
          : `; ${outcome.remaining} other market(s) keep it`),
    });

    revalidatePath('/admin/pages/categories');
    revalidatePath('/admin/pages');
    return success(
      undefined,
      outcome.retired
        ? `Category removed. No other market used it, so it has been deleted. ${moved.count} page(s) ${movePagesTo ? 'moved' : 'are now uncategorised'}.`
        : `Removed from ${scope.country.name}. ${outcome.remaining} other market(s) still use it. ${moved.count} page(s) ${movePagesTo ? 'moved' : 'are now uncategorised'}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/** Persists a new display order. Ids are applied in the order given. */
export async function reorderPageCategories(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('pages.edit');
    const { ids } = pageCategoryOrderSchema.parse(input);

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.pageCategory.update({ where: { id }, data: { sortOrder: index * 10 } }),
      ),
    );

    await recordAudit({
      actor: user,
      action: 'reordered',
      entity: 'PageCategory',
      summary: `Reordered ${ids.length} page category(ies)`,
    });

    revalidatePath('/admin/pages/categories');
    return success(undefined, 'Order saved.');
  } catch (error) {
    return toActionError(error);
  }
}
