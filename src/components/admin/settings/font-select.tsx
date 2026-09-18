'use client';

import * as React from 'react';
import { Search, Check, X } from 'lucide-react';
import {
  GOOGLE_FONTS,
  FONT_CATEGORY_LABELS,
  findGoogleFont,
  fontStack,
  googleFontsHref,
  type GoogleFont,
} from '@/lib/cms/google-fonts';
import { Input, Select, Label } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

/**
 * Searchable Google Font picker.
 *
 * The catalogue is a small static list bundled with the app, so searching costs
 * no network request. Only the family the admin actually picks is ever
 * requested by the public site — see BrandStyle.
 */
/**
 * How many families the picker will fetch at once so each option can be shown
 * in its own typeface. Search narrows the list well below this in practice; the
 * cap is what stops an unfiltered browse from requesting the whole catalogue.
 */
const PREVIEW_LIMIT = 18;

/**
 * Loads just enough of Google Fonts to preview the options currently on screen.
 *
 * This runs only in the admin, only while the picker is open, and only at
 * weight 400 — the public site still requests nothing but the family the admin
 * finally chose, at the weights it actually uses. Each stylesheet is added once
 * and left in place, so scrolling back to a font already seen costs nothing.
 */
function useFontPreviews(families: string[], enabled: boolean): void {
  const loaded = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!enabled) return;

    const wanted = families.slice(0, PREVIEW_LIMIT).filter((family) => !loaded.current.has(family));
    if (wanted.length === 0) return;

    const href = googleFontsHref(wanted.map((family) => ({ family, weights: [400] })));
    if (!href) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fontPreview = 'true';
    document.head.appendChild(link);
    for (const family of wanted) loaded.current.add(family);
  }, [families, enabled]);
}

export function FontSelect({
  label,
  value,
  onChange,
  id,
  hint,
  allowInherit = false,
  inheritLabel = 'Same as body font',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
  hint?: string;
  allowInherit?: boolean;
  inheritLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const matches = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? GOOGLE_FONTS.filter(
          (font) => font.family.toLowerCase().includes(term) || font.category.includes(term),
        )
      : GOOGLE_FONTS;

    const grouped = new Map<GoogleFont['category'], GoogleFont[]>();
    for (const font of list) {
      const bucket = grouped.get(font.category) ?? [];
      bucket.push(font);
      grouped.set(font.category, bucket);
    }
    return Array.from(grouped.entries());
  }, [query]);

  // Families in the order they appear, so the cap loads what is nearest the top.
  const visibleFamilies = React.useMemo(
    () => matches.flatMap(([, fonts]) => fonts.map((font) => font.family)),
    [matches],
  );
  useFontPreviews(visibleFamilies, open);

  const known = findGoogleFont(value);
  const isInherit = allowInherit && !value.trim();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div className="rounded-lg border border-hairline p-2.5">
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-base text-content"
            style={isInherit ? undefined : { fontFamily: fontStack(value) }}
          >
            {isInherit ? (
              <span className="text-sm text-muted">{inheritLabel}</span>
            ) : (
              value || 'Choose a font'
            )}
          </span>

          {!isInherit && !known && value ? (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-amber-700">
              Not a Google Font
            </span>
          ) : null}

          {allowInherit && value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={`Reset ${label}`}
              title={inheritLabel}
              className="shrink-0 rounded p-1.5 text-muted transition-colors hover:text-content"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            id={id}
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/5"
          >
            {open ? 'Close' : 'Browse fonts'}
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
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or style"
                aria-label={`Search fonts for ${label}`}
                className="h-9 pl-8 text-sm"
              />
            </div>

            {matches.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted">No font matches “{query}”.</p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {allowInherit ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-left text-sm text-muted transition-colors hover:border-brand"
                  >
                    {inheritLabel}
                  </button>
                ) : null}

                {matches.map(([category, fonts]) => (
                  <div key={category}>
                    <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
                      {FONT_CATEGORY_LABELS[category]}
                    </p>
                    <ul className="space-y-1">
                      {fonts.map((font) => (
                        <li key={font.family}>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(font.family);
                              setOpen(false);
                              setQuery('');
                            }}
                            aria-pressed={value === font.family}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                              value === font.family
                                ? 'border-brand bg-brand/5'
                                : 'border-transparent hover:border-hairline hover:bg-muted/5',
                            )}
                          >
                            <span className="min-w-0">
                              <span
                                className="block truncate text-base text-content"
                                // Falls back to the category's stack until the
                                // preview stylesheet arrives, so the row never
                                // reflows from blank to text.
                                style={{ fontFamily: fontStack(font.family) }}
                              >
                                {font.family}
                              </span>
                              <span className="block truncate text-[0.6875rem] text-muted">
                                {FONT_CATEGORY_LABELS[font.category]}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="text-xs text-muted">
                                {font.weights.length} weights
                              </span>
                              {value === font.family ? (
                                <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Weight picker limited to the weights the chosen family actually ships. */
export function FontWeightSelect({
  label,
  family,
  value,
  onChange,
  id,
  error,
}: {
  label: string;
  family: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
  error?: string[];
}) {
  const font = findGoogleFont(family);
  const weights = font?.weights ?? [300, 400, 500, 600, 700, 800];

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {weights.map((weight) => (
          <option key={weight} value={String(weight)}>
            {weight} — {WEIGHT_NAMES[weight] ?? 'Custom'}
          </option>
        ))}
      </Select>
      {error?.length ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi bold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};
