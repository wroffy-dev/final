'use client';

import * as React from 'react';
import { listProductOptions, type PickerOption } from '@/lib/actions/pickers';
import { OrderedMultiSelect } from './ordered-multi-select';

/**
 * Ordered product picker.
 *
 * The add/reorder/remove behaviour moved into `OrderedMultiSelect` when the
 * blog needed the same control for posts and categories, so there is one
 * implementation rather than three.
 */
export function ProductMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [options, setOptions] = React.useState<PickerOption[]>([]);

  React.useEffect(() => {
    listProductOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  return (
    <OrderedMultiSelect
      value={value}
      onChange={onChange}
      options={options}
      addLabel="Add a product…"
      emptyLabel="No products selected."
      itemNoun="product"
    />
  );
}
