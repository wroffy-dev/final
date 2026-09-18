'use client';

import * as React from 'react';
import { X, Upload } from 'lucide-react';
import { MediaBrowser } from '@/components/admin/media-picker';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

/**
 * Branding fields store a URL rather than a media id, so a hosted logo can be
 * pasted in directly. The library browser fills the field for convenience.
 */
export function MediaUrlPicker({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="space-y-2">
        {value ? (
          <div className="flex items-center gap-3 rounded-lg border border-hairline p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="h-12 w-24 shrink-0 rounded border border-hairline bg-muted/5 object-contain"
            />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{value}</span>
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input
            id={id}
            value={value}
            placeholder="/uploads/2026/03/logo.png"
            onChange={(e) => onChange(e.target.value)}
          />
          <Button variant="outline" size="md" onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Library
          </Button>
        </div>
      </div>

      <MediaBrowser
        open={open}
        onClose={() => setOpen(false)}
        kind="IMAGE"
        onSelect={(media) => {
          onChange(media.url);
          setOpen(false);
        }}
      />
    </Field>
  );
}
