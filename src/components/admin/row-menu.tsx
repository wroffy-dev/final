'use client';

import * as React from 'react';
import { EllipsisVertical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** Shared dropdown for table row actions. Closes on outside click and Escape. */
export function RowMenu({ label = 'More actions', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-dropdown mt-1 w-52 rounded-lg border border-hairline bg-surface p-1 shadow-xl"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function RowMenuItem({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
        tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-content hover:bg-muted/10',
      )}
    >
      {children}
    </button>
  );
}

export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2">
      <span className="text-sm font-medium text-content">{count} selected</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {children}
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-content"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** Row-selection state shared by every admin table. */
export function useSelection<T extends { id: string }>(rows: T[]) {
  const [selected, setSelected] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSelected((current) => current.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return {
    selected,
    allSelected,
    clear: () => setSelected([]),
    toggle: (id: string) =>
      setSelected((current) =>
        current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
      ),
    toggleAll: () => setSelected(allSelected ? [] : rows.map((row) => row.id)),
  };
}
