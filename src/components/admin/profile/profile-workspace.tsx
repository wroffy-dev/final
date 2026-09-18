'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { ProfileTab } from './profile-tab';
import { SecurityTab } from './security-tab';
import { PersonalTab } from './personal-tab';
import { ActivityTab } from './activity-tab';
import type { ProfileData } from '@/lib/services/profile';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Password & Security' },
  { id: 'personal', label: 'Personal Details' },
  { id: 'activity', label: 'Activity' },
];

/**
 * The tab shell.
 *
 * The active tab lives in the query string so the account menu can link
 * straight to Security and so a link to a specific tab survives a reload.
 */
export function ProfileWorkspace({
  data,
  maxUploadLabel,
}: {
  data: ProfileData;
  maxUploadLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get('tab') ?? 'profile';
  const active = TABS.some((tab) => tab.id === requested) ? requested : 'profile';

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === 'profile') params.delete('tab');
    else params.set('tab', id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      <AdminTabs tabs={TABS} active={active} onChange={select} className="mb-5" />

      <TabPanel id="profile" active={active}>
        <ProfileTab data={data} maxUploadLabel={maxUploadLabel} />
      </TabPanel>
      <TabPanel id="security" active={active}>
        <SecurityTab data={data} />
      </TabPanel>
      <TabPanel id="personal" active={active}>
        <PersonalTab data={data} />
      </TabPanel>
      <TabPanel id="activity" active={active}>
        <ActivityTab data={data} />
      </TabPanel>
    </>
  );
}
