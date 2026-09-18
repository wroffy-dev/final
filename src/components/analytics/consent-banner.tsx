'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

const COOKIE = 'tracking_consent';

/** Shown only when Admin → Marketing requires consent before loading tags. */
export function ConsentBanner({ message }: { message: string }) {
  const [visible, setVisible] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    setVisible(!document.cookie.includes(`${COOKIE}=`));
  }, []);

  const decide = (granted: boolean) => {
    const maxAge = 60 * 60 * 24 * 180;
    document.cookie = `${COOKIE}=${granted ? 'granted' : 'denied'};path=/;max-age=${maxAge};samesite=lax`;
    setVisible(false);
    if (granted) router.refresh();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-toast mx-auto max-w-3xl rounded-xl border border-hairline bg-surface p-4 shadow-2xl sm:inset-x-6 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{message}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => decide(false)}>
            Decline
          </Button>
          <Button size="sm" onClick={() => decide(true)}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
