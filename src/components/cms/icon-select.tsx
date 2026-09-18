'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { CMS_ICON_NAMES, resolveCmsIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

/**
 * Searchable icon picker over the allow-listed CMS icon set.
 *
 * Icon names are resolved through `resolveCmsIcon`, so an editor can never pull
 * arbitrary markup into the page — only an icon this app already ships.
 */
export function IconSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const matches = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return CMS_ICON_NAMES;
    return CMS_ICON_NAMES.filter((name) => name.includes(term));
  }, [query]);

  const Selected = resolveCmsIcon(value);

  return (
    <div className="rounded-lg border border-hairline p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            Selected ? 'bg-brand/10 text-brand' : 'bg-muted/10 text-muted',
          )}
        >
          {Selected ? <Icon component={Selected} /> : <span className="text-[0.625rem]">none</span>}
        </span>

        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{value || 'No icon selected'}</span>

        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Remove icon"
            className="rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/5"
        >
          {open ? 'Close' : value ? 'Change' : 'Choose icon'}
        </button>
      </div>

      {open ? (
        <div className="mt-2.5 border-t border-hairline pt-2.5">
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id={id}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons"
              aria-label="Search icons"
              className="h-9 pl-8 text-sm"
            />
          </div>

          {matches.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted">No icon matches “{query}”.</p>
          ) : (
            <ul className="grid max-h-52 grid-cols-6 gap-1.5 overflow-y-auto sm:grid-cols-8">
              {matches.map((name) => {
                const Component = resolveCmsIcon(name);
                if (!Component) return null;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      title={name}
                      aria-label={name}
                      aria-pressed={value === name}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={cn(
                        'flex aspect-square w-full items-center justify-center rounded-lg border transition-colors',
                        value === name
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-hairline text-muted hover:border-brand hover:text-brand',
                      )}
                    >
                      <Icon component={Component} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Icon({ component: Component }: { component: React.ComponentType<{ className?: string }> }) {
  return <Component className="h-4 w-4" />;
}
