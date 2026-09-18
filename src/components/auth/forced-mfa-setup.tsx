'use client';

import { useRouter } from 'next/navigation';
import { MfaSetupPanel } from './mfa-setup-panel';

/**
 * The onboarding wrapper around the shared setup panel.
 *
 * Its only job is what happens afterwards: enrolling also satisfies this
 * session's second factor, so the user lands on the dashboard rather than
 * being asked for another code straight away.
 */
export function ForcedMfaSetup() {
  const router = useRouter();

  return (
    <MfaSetupPanel
      autoStart
      doneLabel="Continue to dashboard"
      onEnrolled={() => {
        router.replace('/admin');
        router.refresh();
      }}
    />
  );
}
