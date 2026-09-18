'use client';

import * as React from 'react';
import { Upload, X, Search, Check } from 'lucide-react';
import { listMedia, uploadMedia, getMediaById, type MediaDto } from '@/lib/actions/media';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Skeleton, EmptyState } from '@/components/ui/states';
import { Spinner } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { formatBytes } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { ACCEPT_ATTRIBUTE, ACCEPT_IMAGES } from '@/lib/media/constants';

/** Single-image field used throughout the CMS and product/blog editors. */
export function MediaPicker({
  value,
  onChange,
  label = 'Image',
  kind = 'IMAGE',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  kind?: 'IMAGE' | 'DOCUMENT' | 'ALL';
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<MediaDto | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelected(null);
      return;
    }
    getMediaById([value])
      .then((rows) => {
        if (!cancelled) setSelected(rows[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div>
      {selected ? (
        <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface p-2.5">
          {selected.kind === 'IMAGE' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.url}
              alt={selected.altText ?? ''}
              className="h-14 w-14 shrink-0 rounded-md border border-hairline object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted/10 text-xs font-medium text-muted">
              {selected.mimeType.split('/')[1]?.slice(0, 4).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-content">
              {selected.title || selected.filename}
            </p>
            <p className="text-xs text-muted">
              {formatBytes(selected.size)}
              {selected.width ? ` · ${selected.width}×${selected.height}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label}`}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="w-full justify-center"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Choose {label.toLowerCase()}
        </Button>
      )}

      <MediaBrowser
        open={open}
        onClose={() => setOpen(false)}
        kind={kind}
        onSelect={(media) => {
          onChange(media.id);
          setSelected(media);
          setOpen(false);
        }}
      />
    </div>
  );
}

export function MediaBrowser({
  open,
  onClose,
  onSelect,
  kind = 'ALL',
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (media: MediaDto) => void;
  kind?: 'IMAGE' | 'DOCUMENT' | 'ALL';
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<MediaDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(
    (search: string) => {
      setLoading(true);
      listMedia({ query: search, kind: kind === 'ALL' ? 'ALL' : kind })
        .then((result) => setItems(result.items))
        .catch(() => toast('Could not load the media library.', 'error'))
        .finally(() => setLoading(false));
    },
    [kind, toast],
  );

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => load(query), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query, load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let uploaded: MediaDto | null = null;

    for (const file of Array.from(files)) {
      const data = new FormData();
      data.set('file', file);
      const result = await uploadMedia(data);
      if (result.ok && result.data) {
        uploaded = result.data;
        setItems((current) => [result.data as MediaDto, ...current]);
      } else if (!result.ok) {
        toast(result.error, 'error');
      }
    }

    setUploading(false);
    if (uploaded) toast('Upload complete.');
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Media library"
      description="Choose an existing file or upload a new one."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload files
              </>
            )}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={kind === 'IMAGE' ? ACCEPT_IMAGES : ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by filename or alt text"
          aria-label="Search media"
          className="pl-9"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Upload className="h-5 w-5" />}
          title="No files yet"
          description="Upload an image to get started."
          action={<Button onClick={() => inputRef.current?.click()}>Upload files</Button>}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={cn(
                  'group relative block w-full overflow-hidden rounded-lg border border-hairline text-left transition-shadow hover:shadow-md',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                )}
              >
                <span className="block aspect-square bg-muted/10">
                  {item.kind === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.altText ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-medium text-muted">
                      {item.mimeType.split('/')[1]?.slice(0, 5).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="absolute inset-0 hidden items-center justify-center bg-brand/70 group-hover:flex">
                  <Check className="h-6 w-6 text-white" aria-hidden="true" />
                </span>
                <span className="block truncate border-t border-hairline bg-surface px-2 py-1.5 text-xs text-content">
                  {item.title || item.filename}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
