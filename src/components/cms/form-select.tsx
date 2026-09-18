'use client';

import * as React from 'react';
import { listFormOptions, type PickerOption } from '@/lib/actions/pickers';
import { Select } from '@/components/ui/field';

export function FormSelect({
  value,
  onChange,
  id,
  allowEmpty = true,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  allowEmpty?: boolean;
}) {
  const [options, setOptions] = React.useState<PickerOption[]>([]);

  React.useEffect(() => {
    listFormOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty ? <option value="">None</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
          {option.hint ? ` (${option.hint})` : ''}
        </option>
      ))}
      {value && !options.some((o) => o.value === value) ? (
        <option value={value}>{value} (missing)</option>
      ) : null}
    </Select>
  );
}
