'use client';

import * as React from 'react';
import {
  addSection,
  updateSection,
  deleteSection,
  duplicateSection,
  reorderSections,
  toggleSectionVisibility,
} from '@/lib/actions/pages';
import type { BuilderSection } from './section-builder';
import { SectionWorkspace, type WorkspaceActions } from './section-workspace';

/**
 * The page builder workspace.
 *
 * Everything about the two-panel builder now lives in `SectionWorkspace`, which
 * the blog builder shares. This component is only the binding between that
 * screen and the page Server Actions, so ordering, visibility and content are
 * persisted exactly as they were before.
 *
 * There is deliberately no embedded preview: an iframe of the page competed for
 * width with the editor and had to be reloaded after every save. Preview opens
 * in its own tab from the page header instead.
 */
export function PageWorkspace({
  pageId,
  initialSections,
  canEdit,
}: {
  pageId: string;
  initialSections: BuilderSection[];
  canEdit: boolean;
}) {
  const actions = React.useMemo<WorkspaceActions>(
    () => ({
      add: (blockType) => addSection(pageId, blockType),
      save: (sectionId, payload) => updateSection(sectionId, payload),
      duplicate: (sectionId) => duplicateSection(sectionId),
      remove: (sectionId) => deleteSection(sectionId),
      reorder: (order) => reorderSections({ pageId, order }),
      toggleVisibility: (sectionId) => toggleSectionVisibility(sectionId),
    }),
    [pageId],
  );

  return (
    <SectionWorkspace
      initialSections={initialSections}
      canEdit={canEdit}
      actions={actions}
      surface="page"
      emptyTitle="No sections yet"
      emptyDescription="Start with a hero, then build the page up section by section."
    />
  );
}
