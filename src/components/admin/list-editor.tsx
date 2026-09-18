'use client';

import * as React from 'react';
import { Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

/** Editable list of plain strings — product features, benefits, bullet lists. */
export function StringListEditor({
  value,
  onChange,
  label,
  itemLabel = 'item',
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  itemLabel?: string;
  placeholder?: string;
}) {
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  };

  return (
    <fieldset className="rounded-lg border border-hairline p-3">
      <legend className="px-1 text-sm font-medium text-content">{label}</legend>
      {value.length === 0 ? (
        <p className="py-2 text-sm text-muted">No {itemLabel}s yet.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <span className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${itemLabel} ${index + 1} up`}
                  className="px-1 text-[0.625rem] leading-none text-muted hover:text-content disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label={`Move ${itemLabel} ${index + 1} down`}
                  className="px-1 text-[0.625rem] leading-none text-muted hover:text-content disabled:opacity-30"
                >
                  ▼
                </button>
              </span>
              <Input
                value={item}
                placeholder={placeholder}
                aria-label={`${itemLabel} ${index + 1}`}
                onChange={(e) => onChange(value.map((v, i) => (i === index ? e.target.value : v)))}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label={`Remove ${itemLabel} ${index + 1}`}
                className="rounded p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={() => onChange([...value, ''])}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add {itemLabel}
      </Button>
    </fieldset>
  );
}

export type SpecItem = { label: string; value: string };

/** Editable label/value pairs used for product specification tables. */
export function SpecListEditor({
  value,
  onChange,
  label,
}: {
  value: SpecItem[];
  onChange: (next: SpecItem[]) => void;
  label: string;
}) {
  const update = (index: number, patch: Partial<SpecItem>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <fieldset className="rounded-lg border border-hairline p-3">
      <legend className="px-1 text-sm font-medium text-content">{label}</legend>
      {value.length === 0 ? (
        <p className="py-2 text-sm text-muted">No specifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                value={item.label}
                placeholder="Storage"
                aria-label={`Specification ${index + 1} label`}
                onChange={(e) => update(index, { label: e.target.value })}
              />
              <Input
                value={item.value}
                placeholder="5 TB"
                aria-label={`Specification ${index + 1} value`}
                onChange={(e) => update(index, { value: e.target.value })}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label={`Remove specification ${index + 1}`}
                className="shrink-0 rounded p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => onChange([...value, { label: '', value: '' }])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add specification
      </Button>
    </fieldset>
  );
}
