'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  addBlogSection,
  updateBlogSection,
  deleteBlogSection,
  duplicateBlogSection,
  reorderBlogSections,
  toggleBlogSectionVisibility,
  copyGlobalSidebarToPost,
  clearPostSidebar,
} from '@/lib/actions/blog-layout';
import type { BuilderSection } from '@/components/cms/section-builder';
import { SectionWorkspace, type WorkspaceActions } from '@/components/cms/section-workspace';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

/**
 * A single article's own sidebar.
 *
 * The same widget builder as the global sidebar, scoped to this post. It only
 * appears once the article is set to use its own sidebar, and it starts from a
 * copy of the global one so a landing-style article is two edits away rather
 * than a rebuild.
 */
export function PostSidebarBuilder({
  postId,
  initialSections,
  canEdit,
}: {
  postId: string;
  initialSections: BuilderSection[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const actions = React.useMemo<WorkspaceActions>(
    () => ({
      add: (blockType) => addBlogSection({ surface: 'SIDEBAR', postId, blockType }),
      save: (sectionId, payload) => updateBlogSection(sectionId, payload),
      duplicate: (sectionId) => duplicateBlogSection(sectionId),
      remove: (sectionId) => deleteBlogSection(sectionId),
      reorder: (order) => reorderBlogSections({ surface: 'SIDEBAR', postId, order }),
      toggleVisibility: (sectionId) => toggleBlogSectionVisibility(sectionId),
    }),
    [postId],
  );

  if (initialSections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline p-6 text-center">
        <p className="text-sm font-medium text-content">This article has no sidebar of its own</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
          Start from a copy of the global sidebar and change only what this article needs. The
          global sidebar is not affected.
        </p>
        {canEdit ? (
          <Button
            className="mt-4"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await copyGlobalSidebarToPost(postId);
              setBusy(false);
              if (!result.ok) {
                toast(result.error, 'error');
                return;
              }
              toast(result.message ?? 'Copied.');
              router.refresh();
            }}
          >
            {busy ? 'Copying…' : 'Start from the global sidebar'}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          These widgets replace the global sidebar on this article only.
        </p>
        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            Use the global sidebar again
          </Button>
        ) : null}
      </div>

      <SectionWorkspace
        initialSections={initialSections}
        canEdit={canEdit}
        actions={actions}
        surface="blogSidebar"
        listLabel="This article’s widgets"
        addTitle="Add a widget to this article"
        addDescription="Only this article sees these widgets."
        emptyTitle="No widgets"
        emptyDescription="Add a widget, or switch back to the global sidebar."
        className="lg:h-[32rem]"
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        pending={busy}
        title="Remove this article’s own sidebar?"
        message="The widgets you configured here are deleted and the article follows the global sidebar again. The global sidebar itself is untouched."
        confirmLabel="Remove custom sidebar"
        onConfirm={async () => {
          setBusy(true);
          const result = await clearPostSidebar(postId);
          setBusy(false);
          setConfirmClear(false);
          if (!result.ok) {
            toast(result.error, 'error');
            return;
          }
          toast(result.message ?? 'Removed.');
          router.refresh();
        }}
      />
    </div>
  );
}
