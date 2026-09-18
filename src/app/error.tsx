'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Global error boundary. Production never sees the underlying message —
 * only the digest, which correlates with the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-20">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-2xl font-bold text-content">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          We hit an unexpected error. Please try again — if it keeps happening, let us know.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-muted/70">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-8">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
