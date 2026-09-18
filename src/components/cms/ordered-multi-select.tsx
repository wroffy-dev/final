'use client';

import * as React from 'react';
import { X, Plus } from 'lucide-react';
import type { PickerOption } from '@/lib/actions/pickers';
import { Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

/**
 * An ordered, hand-picked list of records.
 *
 * Products, posts and categories are all chosen the same way — add from a
 * dropdown, reorder, remove — so they share one control. Order matters: it is
 * the order the section renders in.
 */
export function OrderedMultiSelect({
  value,
  onChange,
  options,
  addLabel,
  emptyLabel,
  itemNoun,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: PickerOption[];
  addLabel: string;
  emptyLabel: string;
  itemNoun: string;
}) {
  const [pending, setPending] = React.useState('');

  const byId = React.useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const available = options.filter((o) => !value.includes(o.value));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((id, index) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2"
            >
              <span className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                  className="px-1 text-[0.625rem] leading-none text-muted hover:text-content disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="Move down"
                  className="px-1 text-[0.625rem] leading-none text-muted hover:text-content disabled:opacity-30"
                >
                  ▼
                </button>
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-content">
                {byId.get(id)?.label ?? `Removed ${itemNoun}`}
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== id))}
                aria-label={`Remove ${byId.get(id)?.label ?? itemNoun}`}
                className="rounded p-1 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{emptyLabel}</p>
      )}

      <div className="flex gap-2">
        <Select
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          aria-label={addLabel}
          className="flex-1"
        >
          <option value="">{addLabel}</option>
          {available.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.hint ? ` — ${option.hint}` : ''}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          size="md"
          disabled={!pending}
          onClick={() => {
            if (!pending) return;
            onChange([...value, pending]);
            setPending('');
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>
    </div>
  );
}
