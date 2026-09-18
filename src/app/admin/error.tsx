'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin]', error);
  }, [error]);

  const isAuthz = error.message.includes('permission');

  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tone={isAuthz ? 'warning' : 'danger'} title={isAuthz ? 'Not permitted' : 'Something went wrong'}>
        <p>
          {isAuthz
            ? 'Your role does not include this action. Ask a super admin to grant the permission.'
            : 'The page could not be loaded. Try again — if it keeps happening, check the server logs.'}
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs opacity-70">Reference: {error.digest}</p> : null}
      </Alert>
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
