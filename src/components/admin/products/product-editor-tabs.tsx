'use client';

import * as React from 'react';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';

/**
 * Splits the product editor into its three jobs.
 *
 * The same reasoning as `PageEditorTabs`: the builder needs the full width, so
 * the product's own fields and its per-market pricing move onto their own tabs
 * rather than being stacked above a three-panel builder in a narrow column.
 *
 * "Details" leads because it is what a product still is without any sections —
 * the fixed specification block the builder stacks underneath.
 */
export function ProductEditorTabs({
  sectionCount,
  visibleCount,
  details,
  builder,
  markets,
}: {
  sectionCount: number;
  visibleCount: number;
  details: React.ReactNode;
  builder: React.ReactNode;
  markets: React.ReactNode;
}) {
  const [tab, setTab] = React.useState('details');

  return (
    <>
      <AdminTabs
        tabs={[
          { id: 'details', label: 'Details & SEO' },
          { id: 'builder', label: 'Page builder', badge: sectionCount },
          { id: 'markets', label: 'Markets & pricing' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      <TabPanel id="details" active={tab}>
        {details}
      </TabPanel>

      <TabPanel id="builder" active={tab}>
        {sectionCount > 0 && visibleCount < sectionCount ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {sectionCount - visibleCount} of {sectionCount} sections are hidden and will not appear
            on the website.
          </p>
        ) : null}
        {builder}
      </TabPanel>

      <TabPanel id="markets" active={tab}>
        {markets}
      </TabPanel>
    </>
  );
}
