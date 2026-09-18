'use client';

import * as React from 'react';
import {
  listBlogCategoryOptions,
  listBlogTagOptions,
  listBlogPostOptions,
  listAuthorOptions,
  type PickerOption,
} from '@/lib/actions/pickers';
import { Select } from '@/components/ui/field';
import { OrderedMultiSelect } from './ordered-multi-select';

/**
 * Blog pickers for the generated block editor.
 *
 * Options are loaded from the server rather than passed down, so a block's
 * field list stays declarative and a newly created category shows up without
 * any screen having to thread it through.
 */

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

function SingleSelect({
  value,
  onChange,
  id,
  options,
  loading,
  noneLabel,
  emptyLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  options: PickerOption[];
  loading: boolean;
  noneLabel: string;
  emptyLabel: string;
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
      {!loading && options.length === 0 ? (
        <p className="mt-1 text-xs text-muted">{emptyLabel}</p>
      ) : null}
    </>
  );
}

export function BlogCategorySelect(props: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const { options, loading } = useOptions(listBlogCategoryOptions);
  return (
    <SingleSelect
      {...props}
      options={options}
      loading={loading}
      noneLabel="Any category"
      emptyLabel="No categories yet — add one under Blog → Categories."
    />
  );
}

export function BlogTagSelect(props: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const { options, loading } = useOptions(listBlogTagOptions);
  return (
    <SingleSelect
      {...props}
      options={options}
      loading={loading}
      noneLabel="Any tag"
      emptyLabel="No tags yet — they are created as you tag articles."
    />
  );
}

export function BlogPostSelect(props: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const { options, loading } = useOptions(listBlogPostOptions);
  return (
    <SingleSelect
      {...props}
      options={options}
      loading={loading}
      noneLabel="Choose automatically"
      emptyLabel="No articles yet."
    />
  );
}

export function BlogAuthorSelect(props: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const { options, loading } = useOptions(listAuthorOptions);
  return (
    <SingleSelect
      {...props}
      options={options}
      loading={loading}
      noneLabel="No fallback author"
      emptyLabel="No active staff accounts."
    />
  );
}

export function BlogPostMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { options } = useOptions(listBlogPostOptions);
  return (
    <OrderedMultiSelect
      value={value}
      onChange={onChange}
      options={options}
      addLabel="Add an article…"
      emptyLabel="No articles chosen."
      itemNoun="article"
    />
  );
}

export function BlogCategoryMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { options } = useOptions(listBlogCategoryOptions);
  return (
    <OrderedMultiSelect
      value={value}
      onChange={onChange}
      options={options}
      addLabel="Add a category…"
      emptyLabel="No categories chosen."
      itemNoun="category"
    />
  );
}
