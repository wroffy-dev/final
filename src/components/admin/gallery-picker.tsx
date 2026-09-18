'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { MediaBrowser } from '@/components/admin/media-picker';
import { getMediaById, type MediaDto } from '@/lib/actions/media';
import { Button } from '@/components/ui/button';

/** Ordered multi-image picker used for product galleries. */
export function GalleryPicker({
  value,
  onChange,
  max = 12,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MediaDto[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    if (value.length === 0) {
      setItems([]);
      return;
    }
    getMediaById(value)
      .then((rows) => {
        if (cancelled) return;
        // Preserve the admin's chosen order rather than the query's.
        const byId = new Map(rows.map((row) => [row.id, row]));
        setItems(value.map((id) => byId.get(id)).filter((row): row is MediaDto => Boolean(row)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value]);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((item, index) => (
            <li key={item.id} className="relative">
              <span className="block overflow-hidden rounded-lg border border-hairline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.altText ?? ''}
                  className="aspect-square w-full object-cover"
                />
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== item.id))}
                aria-label={`Remove ${item.title || item.filename}`}
                className="absolute right-1 top-1 rounded-full bg-surface/90 p-1 text-muted shadow transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="mt-1 flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move image ${index + 1} earlier`}
                  className="rounded px-1.5 text-xs text-muted hover:text-content disabled:opacity-30"
                >
                  ←
                </button>
                <span className="text-[0.625rem] text-muted">{index + 1}</span>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move image ${index + 1} later`}
                  className="rounded px-1.5 text-xs text-muted hover:text-content disabled:opacity-30"
                >
                  →
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No gallery images yet.</p>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={value.length >= max}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add image
      </Button>

      <MediaBrowser
        open={open}
        onClose={() => setOpen(false)}
        kind="IMAGE"
        onSelect={(media) => {
          if (!value.includes(media.id) && value.length < max) onChange([...value, media.id]);
          setOpen(false);
        }}
      />
    </div>
  );
}
