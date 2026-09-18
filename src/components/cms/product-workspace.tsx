'use client';

import * as React from 'react';
import {
  addProductSection,
  updateProductSection,
  deleteProductSection,
  duplicateProductSection,
  reorderProductSections,
  toggleProductSectionVisibility,
} from '@/lib/actions/product-sections';
import type { BuilderSection } from './section-builder';
import { SectionWorkspace, type WorkspaceActions } from './section-workspace';

/**
 * The product builder workspace.
 *
 * The same binding `PageWorkspace` is: the two-panel builder lives in
 * `SectionWorkspace`, and this component only points it at the product Server
 * Actions.
 *
 * It builds on the `page` surface on purpose. A block's surface decides which
 * blocks the "Add section" picker offers, and everything a page can stack —
 * hero, feature grid, FAQ, testimonials, CTA — is exactly what a product page
 * wants underneath its specification. Giving products their own surface would
 * have meant re-declaring every block for it and leaving new page blocks
 * silently missing here.
 */
export function ProductWorkspace({
  productId,
  initialSections,
  canEdit,
}: {
  productId: string;
  initialSections: BuilderSection[];
  canEdit: boolean;
}) {
  const actions = React.useMemo<WorkspaceActions>(
    () => ({
      add: (blockType) => addProductSection(productId, blockType),
      save: (sectionId, payload) => updateProductSection(sectionId, payload),
      duplicate: (sectionId) => duplicateProductSection(sectionId),
      remove: (sectionId) => deleteProductSection(sectionId),
      reorder: (order) => reorderProductSections({ productId, order }),
      toggleVisibility: (sectionId) => toggleProductSectionVisibility(sectionId),
    }),
    [productId],
  );

  return (
    <SectionWorkspace
      initialSections={initialSections}
      canEdit={canEdit}
      actions={actions}
      surface="page"
      dndId={`product-${productId}`}
      emptyTitle="No sections yet"
      emptyDescription="The product's details, pricing and specification always show above. Add sections here to build the rest of the page."
    />
  );
}
