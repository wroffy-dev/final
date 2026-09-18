/**
 * Shared vocabulary for URL-backed list filters.
 *
 * Filters live in the query string so a filtered view is refresh-safe,
 * shareable and back/forward friendly, and so the server can do the filtering.
 */

export type FilterOption = { label: string; value: string; hint?: string };

export type FilterDefinition = {
  /** Query-string key. */
  name: string;
  label: string;
  /** `select` renders a dropdown; `date` a pair of from/to inputs. */
  kind?: 'select' | 'date';
  options?: FilterOption[];
  /** Placeholder shown when nothing is chosen. */
  allLabel?: string;
  /** Primary filters sit in the bar; the rest live in "More filters". */
  advanced?: boolean;
};

export type FilterPreset = {
  id: string;
  label: string;
  /** Applied verbatim; every other filter is cleared. */
  params: Record<string, string>;
};

/** Query keys that are not filters and must survive a filter change. */
export const NON_FILTER_KEYS = new Set(['page', 'sort', 'dir', 'tab', 'view']);

/** Human-readable summary of what is currently applied, for the chip row. */
export function describeFilters(
  params: Record<string, string | undefined>,
  definitions: FilterDefinition[],
): Array<{ name: string; label: string; value: string; display: string }> {
  const chips: Array<{
    name: string;
    label: string;
    value: string;
    display: string;
  }> = [];

  for (const definition of definitions) {
    if (definition.kind === 'date') continue;
    const value = params[definition.name];
    if (!value) continue;
    const option = definition.options?.find((candidate) => candidate.value === value);
    chips.push({
      name: definition.name,
      label: definition.label,
      value,
      display: option?.label ?? value,
    });
  }

  return chips;
}

/** True when anything other than paging/sorting is applied. */
export function hasActiveFilters(params: Record<string, string | undefined>): boolean {
  return Object.entries(params).some(([key, value]) => Boolean(value) && !NON_FILTER_KEYS.has(key));
}

export function countActiveFilters(params: Record<string, string | undefined>): number {
  const keys = Object.entries(params).filter(
    ([key, value]) => Boolean(value) && !NON_FILTER_KEYS.has(key),
  );
  // A from/to pair reads as one "Date range" filter, not two.
  const hasFrom = keys.some(([key]) => key === 'from');
  const hasTo = keys.some(([key]) => key === 'to');
  const raw = keys.filter(([key]) => key !== 'from' && key !== 'to').length;
  return raw + (hasFrom || hasTo ? 1 : 0);
}

/** ISO date (yyyy-mm-dd) `days` before today, for the date presets. */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function today(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  // Monday-first, which is how a sales week is usually counted.
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}
