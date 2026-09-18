'use client';

import * as React from 'react';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';

/**
 * Splits the page editor into the builder and everything else.
 *
 * The builder needs the full width, so page settings, SEO and publishing live
 * on their own tab rather than squeezing a sidebar next to three panels.
 */
export function PageEditorTabs({
  sectionCount,
  visibleCount,
  builder,
  settings,
}: {
  sectionCount: number;
  visibleCount: number;
  builder: React.ReactNode;
  settings: React.ReactNode;
}) {
  const [tab, setTab] = React.useState('builder');

  return (
    <>
      <AdminTabs
        tabs={[
          { id: 'builder', label: 'Page builder', badge: sectionCount },
          { id: 'settings', label: 'Settings & SEO' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      <TabPanel id="builder" active={tab}>
        {sectionCount > 0 && visibleCount < sectionCount ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {sectionCount - visibleCount} of {sectionCount} sections are hidden and will not appear
            on the website.
          </p>
        ) : null}
        {builder}
      </TabPanel>

      <TabPanel id="settings" active={tab}>
        {settings}
      </TabPanel>
    </>
  );
}
