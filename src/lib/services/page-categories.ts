import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { flattenTree } from '@/lib/utils/tree';

export type PageCategoryOption = { id: string; name: string; depth: number };

/**
 * The category tree flattened for a dropdown — parents immediately above their
 * children, with a depth to indent by. Shared by the page create and edit
 * routes and the pages list filter so all three show the same order.
 */
export async function listPageCategoryOptions(): Promise<PageCategoryOption[]> {
  const rows = await prisma.pageCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, parentId: true, sortOrder: true },
  });

  return flattenTree(rows, (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(
    ({ node, depth }) => ({ id: node.id, name: node.name, depth }),
  );
}
