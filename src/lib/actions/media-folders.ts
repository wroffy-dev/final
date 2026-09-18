'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { canSetParent } from '@/lib/utils/tree';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

/**
 * User-facing media folders.
 *
 * Entirely separate from where a file physically lives: storage keys and URLs
 * are never touched by any action here, so moving an item between folders can
 * never break an image already embedded in a page.
 */

const PARENT_LABELS = {
  self: 'A folder cannot be inside itself.',
  cycle: 'That would move a folder into one of its own subfolders.',
  missing: 'That parent folder no longer exists.',
};

const folderSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  parentId: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

async function loadTree() {
  return prisma.mediaFolder.findMany({ select: { id: true, parentId: true } });
}

export async function saveMediaFolder(
  folderId: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('media.edit');
    const parsed = folderSchema.parse(input);

    const parentCheck = canSetParent(await loadTree(), folderId, parsed.parentId, PARENT_LABELS);
    if (!parentCheck.ok) return failure(parentCheck.error);

    // Two folders may not share a name under the same parent, or the tree
    // becomes ambiguous to read.
    const sibling = await prisma.mediaFolder.findFirst({
      where: {
        name: parsed.name,
        parentId: parsed.parentId,
        ...(folderId ? { NOT: { id: folderId } } : {}),
      },
      select: { id: true },
    });
    if (sibling) return failure('A folder with that name already exists here.');

    const data = { name: sanitizeText(parsed.name), parentId: parsed.parentId };

    const folder = folderId
      ? await prisma.mediaFolder.update({ where: { id: folderId }, data })
      : await prisma.mediaFolder.create({ data });

    await recordAudit({
      actor: user,
      action: folderId ? 'updated' : 'created',
      entity: 'MediaFolder',
      entityId: folder.id,
      summary: `${folderId ? 'Renamed' : 'Created'} media folder “${folder.name}”`,
    });

    revalidatePath('/admin/media');
    return success({ id: folder.id }, 'Folder saved.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Deletes a folder without deleting a single file.
 *
 * Its media and its subfolders both move up to the deleted folder's own
 * parent — so nothing is orphaned, and nothing lands in Uncategorised unless
 * the folder was already top-level.
 */
export async function deleteMediaFolder(folderId: string): Promise<ActionResult> {
  try {
    const user = await authorize('media.delete');

    const folder = await prisma.mediaFolder.findUnique({
      where: { id: folderId },
      include: { _count: { select: { media: true, children: true } } },
    });
    if (!folder) return failure('That folder no longer exists.');

    await prisma.$transaction(async (tx) => {
      await tx.media.updateMany({ where: { folderId }, data: { folderId: folder.parentId } });
      await tx.mediaFolder.updateMany({
        where: { parentId: folderId },
        data: { parentId: folder.parentId },
      });
      await tx.mediaFolder.delete({ where: { id: folderId } });
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'MediaFolder',
      entityId: folderId,
      summary:
        `Deleted media folder “${folder.name}” — ${folder._count.media} file(s) and ` +
        `${folder._count.children} subfolder(s) moved up. No file was deleted.`,
    });

    revalidatePath('/admin/media');
    return success(
      undefined,
      `Folder deleted. ${folder._count.media} file(s) moved to ${folder.parentId ? 'the parent folder' : 'Uncategorised'}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

const moveSchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(200),
  /** Null moves the items to Uncategorised. */
  folderId: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

/** Moves one or many items into a folder. Files themselves are untouched. */
export async function moveMediaToFolder(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('media.edit');
    const { mediaIds, folderId } = moveSchema.parse(input);

    if (folderId) {
      const folder = await prisma.mediaFolder.findUnique({
        where: { id: folderId },
        select: { id: true, name: true },
      });
      if (!folder) return failure('That folder no longer exists.');
    }

    const result = await prisma.media.updateMany({
      where: { id: { in: mediaIds }, deletedAt: null },
      data: { folderId },
    });
    if (result.count === 0) return failure('Those files no longer exist.');

    await recordAudit({
      actor: user,
      action: 'moved',
      entity: 'Media',
      summary: `Moved ${result.count} file(s) to ${folderId ? 'a folder' : 'Uncategorised'}`,
    });

    revalidatePath('/admin/media');
    return success(undefined, `${result.count} file(s) moved.`);
  } catch (error) {
    return toActionError(error);
  }
}

export type MediaFolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
};

/** The folder tree with a direct file count on each node. */
export async function listMediaFolders(): Promise<MediaFolderNode[]> {
  await authorize('media.view');

  const folders = await prisma.mediaFolder.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { media: { where: { deletedAt: null } } } },
    },
  });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    fileCount: folder._count.media,
  }));
}
