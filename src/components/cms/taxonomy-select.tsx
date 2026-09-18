'use client';

import * as React from 'react';
import { listProductCategoryOptions, listBrandOptions, type PickerOption } from '@/lib/actions/pickers';
import { Select } from '@/components/ui/field';

function useOptions(load: () => Promise<PickerOption[]>) {
  const [options, setOptions] = React.useState<PickerOption[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    load()
      .then((rows) => {
        if (!cancelled) setOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is a stable server-action reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { options, loading };
}

function TaxonomySelect({
  value,
  onChange,
  id,
  options,
  loading,
  emptyLabel,
  noneLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  options: PickerOption[];
  loading: boolean;
  emptyLabel: string;
  noneLabel: string;
}) {
  return (
    <>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
        <option value="">{loading ? 'Loading…' : noneLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.hint ? ` (${option.hint})` : ''}
          </option>
        ))}
        {value && !loading && !options.some((o) => o.value === value) ? (
          <option value={value}>No longer available</option>
        ) : null}
      </Select>
      {!loading && options.length === 0 ? <p className="mt-1 text-xs text-muted">{emptyLabel}</p> : null}
    </>
  );
}

export function CategorySelect(props: { value: string; onChange: (next: string) => void; id?: string }) {
  const { options, loading } = useOptions(listProductCategoryOptions);
  return (
    <TaxonomySelect
      {...props}
      options={options}
      loading={loading}
      noneLabel="Any category"
      emptyLabel="No categories yet — add one under Products → Categories."
    />
  );
}

export function BrandSelect(props: { value: string; onChange: (next: string) => void; id?: string }) {
  const { options, loading } = useOptions(listBrandOptions);
  return (
    <TaxonomySelect
      {...props}
      options={options}
      loading={loading}
      noneLabel="Any brand"
      emptyLabel="No brands yet — add one under Products → Brands."
    />
  );
}
