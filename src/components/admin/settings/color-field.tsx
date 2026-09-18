'use client';

import { Field, Input } from '@/components/ui/field';

/** Hex text input paired with a native colour picker, kept in sync. */
export function ColorField({
  label,
  name,
  value,
  onChange,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  error?: string[];
}) {
  const isValid = /^#[0-9a-fA-F]{6}$/.test(value);

  return (
    <Field label={label} htmlFor={name} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isValid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} colour picker`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-hairline bg-surface p-1"
        />
        <Input
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.trim().toUpperCase())}
          placeholder="#0061FF"
          aria-invalid={!isValid || undefined}
          className="font-mono text-sm uppercase"
        />
      </div>
    </Field>
  );
}
