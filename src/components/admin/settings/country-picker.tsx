'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { searchCountries, type IsoCountry } from '@/lib/country/iso';
import { cn } from '@/lib/utils/cn';

/**
 * A searchable ISO 3166-1 country picker.
 *
 * Typing the name or the code narrows the list. It is a listbox rather than a
 * `<select>` because a native select with 249 options cannot be searched by
 * anything but first letter, and "United Arab Emirates" is unreachable that way
 * from the letter U without a lot of scrolling.
 *
 * Keyboard: the input keeps focus throughout, arrows move the active option,
 * Enter picks it and Escape closes — so it behaves like the combobox pattern
 * a screen reader expects rather than a div that happens to open.
 */
export function CountryPicker({
  value,
  onSelect,
  disabledCodes,
  id,
  invalid,
}: {
  /** The selected alpha-2 code, or empty. */
  value: string;
  onSelect: (country: IsoCountry) => void;
  /** Codes already in use, shown but not selectable. */
  disabledCodes: string[];
  id: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;

  const taken = React.useMemo(
    () => new Set(disabledCodes.map((code) => code.toUpperCase())),
    [disabledCodes],
  );
  const results = React.useMemo(() => searchCountries(query), [query]);
  const selected = React.useMemo(
    () => (value ? searchCountries(value).find((c) => c.code === value.toUpperCase()) : null),
    [value],
  );

  // Close on a click outside. The handler is attached only while open, so a
  // closed picker costs nothing.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  React.useEffect(() => setActive(0), [query]);

  function choose(country: IsoCountry) {
    if (taken.has(country.code)) return;
    onSelect(country);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return Math.max(0, Math.min(results.length - 1, next));
      });
    } else if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      const country = results[active];
      if (country) choose(country);
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-opt-${results[active].code}` : undefined}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          value={open ? query : (selected ? `${selected.name} (${selected.code})` : '')}
          placeholder="Search by country name or code…"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface pl-9 pr-9 text-sm text-content',
            'placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30',
            invalid ? 'border-red-500' : 'border-hairline',
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-hairline bg-surface py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No country matches “{query}”.</li>
          ) : (
            results.map((country, index) => {
              const inUse = taken.has(country.code);
              const isActive = index === active;
              return (
                <li key={country.code}>
                  <button
                    id={`${id}-opt-${country.code}`}
                    type="button"
                    role="option"
                    aria-selected={country.code === value.toUpperCase()}
                    aria-disabled={inUse || undefined}
                    disabled={inUse}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(country)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                      inUse
                        ? 'cursor-not-allowed text-muted/60'
                        : 'text-content hover:bg-brand/5',
                      isActive && !inUse ? 'bg-brand/5' : null,
                    )}
                  >
                    <span className="w-8 shrink-0 font-mono text-xs text-muted">{country.code}</span>
                    <span className="min-w-0 flex-1 truncate">{country.name}</span>
                    {country.currency ? (
                      <span className="shrink-0 text-xs text-muted">{country.currency}</span>
                    ) : null}
                    {inUse ? (
                      <span className="shrink-0 text-xs">Added</span>
                    ) : country.code === value.toUpperCase() ? (
                      <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
