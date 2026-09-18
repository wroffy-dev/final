'use client';

import { Plus } from 'lucide-react';
import { formFieldTypes } from '@/lib/validation/form';
import { FIELD_TYPE_LABELS, MAPPED_FIELD_TYPES } from '@/lib/cms/form-model';
import { cn } from '@/lib/utils/cn';

/**
 * Field types an admin can add, grouped so the list is scannable.
 *
 * The groups are a presentation of `formFieldTypes` — the validation schema
 * stays the single source of truth, and anything it allows but this file has
 * not placed lands in "Advanced" rather than disappearing.
 */
const GROUPS: Array<{ label: string; types: string[] }> = [
  { label: 'Contact', types: ['NAME', 'EMAIL', 'PHONE', 'COMPANY'] },
  { label: 'Basic', types: ['TEXT', 'TEXTAREA', 'NUMBER'] },
  { label: 'Choice', types: ['SELECT', 'RADIO', 'CHECKBOX'] },
  { label: 'Advanced', types: ['DATE', 'URL', 'CONSENT', 'HIDDEN'] },
];

export function FieldPalette({
  onAdd,
  disabled,
}: {
  onAdd: (type: string) => void;
  disabled?: boolean;
}) {
  const placed = new Set(GROUPS.flatMap((group) => group.types));
  const groups = GROUPS.map((group) => ({
    ...group,
    types: group.types.filter((type) => (formFieldTypes as readonly string[]).includes(type)),
  })).filter((group) => group.types.length > 0);

  const unplaced = formFieldTypes.filter((type) => !placed.has(type));
  if (unplaced.length > 0) {
    groups.push({ label: 'Other', types: [...unplaced] });
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
            {group.label}
          </h3>
          <ul className="space-y-1">
            {group.types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => onAdd(type)}
                  disabled={disabled}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border border-hairline px-2.5 py-1.5 text-left',
                    'text-[0.8125rem] text-content transition-colors',
                    'hover:border-brand hover:bg-brand/[0.04] hover:text-brand',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{FIELD_TYPE_LABELS[type] ?? type}</span>
                  {MAPPED_FIELD_TYPES.has(type) ? (
                    <span
                      className="shrink-0 rounded bg-brand/10 px-1 text-[0.625rem] font-medium text-brand"
                      title="Fills this field on the lead record automatically"
                    >
                      CRM
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
