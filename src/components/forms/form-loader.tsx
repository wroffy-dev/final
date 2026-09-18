'use client';

import * as React from 'react';
import type { PublicForm } from '@/lib/services/forms';
import { PublicFormRenderer } from './public-form';
import { Skeleton } from '@/components/ui/states';
import { fetchPublicForm } from '@/lib/actions/fetch-form';

/**
 * Client-side form loader used where the form is only known at interaction
 * time (popups, product CTA dialogs). Server-rendered blocks pass the form
 * straight to <PublicFormRenderer /> instead.
 */
export function PublicFormLoader({
  slug,
  productId,
  leadMagnetId,
  compact,
  ctaLabel,
  ctaLocation,
  context,
}: {
  slug: string;
  productId?: string | null;
  leadMagnetId?: string | null;
  compact?: boolean;
  ctaLabel?: string;
  ctaLocation?: string;
  /** Display values for the form's system fields. */
  context?: Record<string, string>;
}) {
  const [form, setForm] = React.useState<PublicForm | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchPublicForm(slug)
      .then((result) => {
        if (cancelled) return;
        if (result) setForm(result);
        else setError('This form is currently unavailable.');
      })
      .catch(() => {
        if (!cancelled) setError('This form could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <p className="rounded-lg border border-hairline bg-muted/5 px-4 py-3 text-sm text-muted" role="status">
        {error}
      </p>
    );
  }

  if (!form) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  return (
    <PublicFormRenderer
      form={form}
      productId={productId}
      leadMagnetId={leadMagnetId}
      compact={compact}
      ctaLabel={ctaLabel}
      ctaLocation={ctaLocation}
      context={context}
    />
  );
}
