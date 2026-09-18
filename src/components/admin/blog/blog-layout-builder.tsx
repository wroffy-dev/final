'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { BlogSurface } from '@prisma/client';
import {
  addBlogSection,
  updateBlogSection,
  deleteBlogSection,
  duplicateBlogSection,
  reorderBlogSections,
  toggleBlogSectionVisibility,
  ensureBlogSurface,
} from '@/lib/actions/blog-layout';
import type { BuilderSection } from '@/components/cms/section-builder';
import { SectionWorkspace, type WorkspaceActions } from '@/components/cms/section-workspace';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { BlockSurface } from '@/lib/cms/blocks';

/**
 * The blog's structure editor.
 *
 * Three surfaces, one builder. Each tab is the same drag-and-drop workspace the
 * page builder uses, bound to the blog Server Actions — so reordering the
 * archive, rearranging the article or rebuilding the sidebar are all the same
 * gesture, and none of them is a code change.
 */

const SURFACE_META: Record<
  BlogSurface,
  { label: string; blockSurface: BlockSurface; listLabel: string; addTitle: string; addDescription: string; empty: string }
> = {
  LISTING: {
    label: 'Listing page',
    blockSurface: 'blogListing',
    listLabel: 'Blog page structure',
    addTitle: 'Add a section to /blog',
    addDescription: 'Drag sections into any order afterwards — the website follows it.',
    empty: 'Add a hero, then the filters, the featured article and the grid.',
  },
  ARTICLE: {
    label: 'Article layout',
    blockSurface: 'blogArticle',
    listLabel: 'Article structure',
    addTitle: 'Add a section to the article page',
    addDescription: 'Applies to every article. Individual posts can still hide any of it.',
    empty: 'Add the header, the content and whatever should surround them.',
  },
  SIDEBAR: {
    label: 'Sidebar',
    blockSurface: 'blogSidebar',
    listLabel: 'Sidebar widgets',
    addTitle: 'Add a sidebar widget',
    addDescription: 'Widgets render top to bottom in the order below.',
    empty: 'Add a search box, recent posts or a lead form.',
  },
};

export function BlogLayoutBuilder({
  surfaces,
  canEdit,
  initialTab = 'LISTING',
}: {
  surfaces: Record<BlogSurface, BuilderSection[]>;
  canEdit: boolean;
  initialTab?: BlogSurface;
}) {
  const [tab, setTab] = React.useState<BlogSurface>(initialTab);

  return (
    <>
      <AdminTabs
        tabs={(Object.keys(SURFACE_META) as BlogSurface[]).map((surface) => ({
          id: surface,
          label: SURFACE_META[surface].label,
          badge: surfaces[surface].length,
        }))}
        active={tab}
        onChange={(id) => setTab(id as BlogSurface)}
        className="mb-4"
      />

      {(Object.keys(SURFACE_META) as BlogSurface[]).map((surface) => (
        <TabPanel key={surface} id={surface} active={tab}>
          <SurfacePanel surface={surface} sections={surfaces[surface]} canEdit={canEdit} />
        </TabPanel>
      ))}
    </>
  );
}

function SurfacePanel({
  surface,
  sections,
  canEdit,
}: {
  surface: BlogSurface;
  sections: BuilderSection[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [claiming, setClaiming] = React.useState(false);
  const meta = SURFACE_META[surface];

  const actions = React.useMemo<WorkspaceActions>(
    () => ({
      add: (blockType) => addBlogSection({ surface, blockType }),
      save: (sectionId, payload) => updateBlogSection(sectionId, payload),
      duplicate: (sectionId) => duplicateBlogSection(sectionId),
      remove: (sectionId) => deleteBlogSection(sectionId),
      reorder: (order) => reorderBlogSections({ surface, postId: null, order }),
      toggleVisibility: (sectionId) => toggleBlogSectionVisibility(sectionId),
    }),
    [surface],
  );

  /**
   * Until this surface has been saved once the website renders a built-in
   * arrangement. Claiming it writes that arrangement out as real rows, so the
   * first edit starts from what is already live rather than an empty screen.
   */
  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline p-8 text-center">
        <p className="text-sm font-medium text-content">
          This layout is using the built-in arrangement
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
          The website already renders a sensible {meta.label.toLowerCase()}. Take control of it to
          reorder, restyle, add or remove its sections — nothing on the website changes until you
          edit something.
        </p>
        {canEdit ? (
          <Button
            className="mt-5"
            disabled={claiming}
            onClick={async () => {
              setClaiming(true);
              const result = await ensureBlogSurface(surface);
              setClaiming(false);
              if (!result.ok) {
                toast(result.error, 'error');
                return;
              }
              router.refresh();
            }}
          >
            {claiming ? 'Preparing…' : 'Customise this layout'}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <SectionWorkspace
      initialSections={sections}
      canEdit={canEdit}
      actions={actions}
      surface={meta.blockSurface}
      listLabel={meta.listLabel}
      addTitle={meta.addTitle}
      addDescription={meta.addDescription}
      emptyTitle="Nothing here yet"
      emptyDescription={meta.empty}
    />
  );
}
