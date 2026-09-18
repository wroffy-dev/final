'use client';

import { CategoryTreeManager, type CategoryRow } from '@/components/admin/category-tree-manager';
import {
  savePageCategory,
  deletePageCategory,
  reorderPageCategories,
} from '@/lib/actions/page-categories';

/**
 * Page categories, on the shared tree manager.
 *
 * This wrapper exists only to bind the page-category Server Actions to the
 * generic component — the UI itself is the same one blog categories use.
 */
export function PageCategoryManager({
  rows,
  canEdit,
  canDelete,
}: {
  rows: CategoryRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <CategoryTreeManager
      rows={rows}
      canEdit={canEdit}
      canDelete={canDelete}
      urlPrefix="/"
      itemLabel="page"
      emptyDescription="Categories group pages in the admin, e.g. Solutions → Cloud Solutions."
      onSave={(id, data) => savePageCategory(id, data)}
      onDelete={(categoryId, movePagesTo) => deletePageCategory({ categoryId, movePagesTo })}
      onReorder={(ids) => reorderPageCategories({ ids })}
    />
  );
}
