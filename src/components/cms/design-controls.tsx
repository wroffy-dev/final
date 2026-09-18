'use client';

import * as React from 'react';
import { Link2, Unlink } from 'lucide-react';
import { LENGTH_UNITS, splitLength, joinLength, type LengthUnit, type BoxValue } from '@/lib/cms/design';
import { Input, Select, Label } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

/**
 * Number + unit control.
 *
 * The admin types a number and picks a unit; the stored value is the finished
 * CSS length ("40px"). Clearing the number stores "", which means "inherit".
 */
export function UnitInput({
  id,
  value,
  onChange,
  placeholder,
  units = LENGTH_UNITS,
  'aria-label': ariaLabel,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  units?: readonly LengthUnit[];
  'aria-label'?: string;
  className?: string;
}) {
  const { amount, unit } = splitLength(value);
  // The unit survives while the number box is empty, so clearing and retyping
  // does not silently snap back to px.
  const [pendingUnit, setPendingUnit] = React.useState<LengthUnit>(unit);
  const activeUnit = amount ? unit : pendingUnit;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={amount}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(joinLength(e.target.value, activeUnit))}
        className="min-w-0 flex-1"
      />
      <Select
        value={activeUnit}
        aria-label={ariaLabel ? `${ariaLabel} unit` : 'Unit'}
        onChange={(e) => {
          const next = e.target.value as LengthUnit;
          setPendingUnit(next);
          if (amount) onChange(joinLength(amount, next));
        }}
        className="w-[4.5rem] shrink-0 px-2"
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
    </div>
  );
}

const SIDES = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
] as const;

/**
 * Four-sided spacing control with an optional "link all sides" toggle.
 *
 * Every side is edited independently — nothing forces one value onto all four.
 */
export function BoxInput({
  label,
  value,
  onChange,
  idPrefix,
  hint,
}: {
  label: string;
  value: BoxValue;
  onChange: (next: BoxValue) => void;
  idPrefix: string;
  hint?: string;
}) {
  const sides = SIDES.map((side) => value[side.key]).filter(Boolean);
  const allEqual = sides.length === 4 && new Set(sides).size === 1;
  const [linked, setLinked] = React.useState(allEqual);

  const set = (key: keyof BoxValue, next: string) => {
    if (linked) {
      onChange({ top: next, right: next, bottom: next, left: next });
      return;
    }
    onChange({ ...value, [key]: next });
  };

  return (
    <fieldset className="rounded-lg border border-hairline p-3">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium text-content">
        {label}
        <button
          type="button"
          onClick={() => setLinked((current) => !current)}
          aria-pressed={linked}
          title={linked ? 'Sides are linked — edit them separately' : 'Link all four sides'}
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] font-normal transition-colors',
            linked ? 'bg-brand/10 text-brand' : 'text-muted hover:text-content',
          )}
        >
          {linked ? <Link2 className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
          {linked ? 'Linked' : 'Separate'}
        </button>
      </legend>

      {hint ? <p className="mb-2 px-1 text-xs text-muted">{hint}</p> : null}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {SIDES.map((side) => (
          <div key={side.key}>
            <Label htmlFor={`${idPrefix}-${side.key}`} className="mb-1 text-xs font-normal text-muted">
              {side.label}
            </Label>
            <UnitInput
              id={`${idPrefix}-${side.key}`}
              value={value[side.key]}
              aria-label={`${label} ${side.label.toLowerCase()}`}
              placeholder="auto"
              onChange={(next) => set(side.key, next)}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Hex text input paired with a native colour picker, kept in sync. */
export function ColorInput({
  label,
  value,
  onChange,
  id,
  hint,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  id: string;
  hint?: string;
  allowEmpty?: boolean;
}) {
  const isValid = /^#[0-9a-fA-F]{6}$/.test(value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isValid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} colour picker`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-hairline bg-surface p-1"
        />
        <Input
          id={id}
          value={value}
          placeholder={allowEmpty ? 'Inherit' : '#0061FF'}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.trim().toUpperCase())}
          aria-invalid={value !== '' && !isValid ? true : undefined}
          className="font-mono text-sm uppercase"
        />
        {allowEmpty && value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 rounded px-2 py-1 text-xs text-muted transition-colors hover:text-content"
          >
            Clear
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {value !== '' && !isValid ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          Use a 6-digit hex colour such as #0061FF.
        </p>
      ) : null}
    </div>
  );
}

/** Collapsible group used to keep the design panel scannable. */
export function DesignGroup({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-hairline" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-content marker:content-['']">
        <span className="flex items-center justify-between gap-2">
          <span>
            {title}
            {description ? <span className="mt-0.5 block text-xs font-normal text-muted">{description}</span> : null}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 text-muted transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-hairline p-3">{children}</div>
    </details>
  );
}
