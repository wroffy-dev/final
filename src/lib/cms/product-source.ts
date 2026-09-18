import { z } from 'zod';
import type { FieldDescriptor } from './fields';

/**
 * The product query a section runs.
 *
 * It lived inside `blocks.ts` until the product slider needed it too, and
 * `blocks.ts` imports the slider definitions — so it moved here rather than
 * being copied. One shape and one field list means "Featured", "By category"
 * and "Hand-picked" behave identically in a card grid, a comparison table and
 * a slider, and a source added here reaches all of them.
 */

export const PRODUCT_SOURCES = ['featured', 'all', 'category', 'selected', 'latest'] as const;

export const productSourceShape = {
  source: z.enum(PRODUCT_SOURCES).catch('featured').default('featured'),
  categoryId: z.string().nullable().default(null),
  productIds: z.array(z.string()).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(3),
};

export const productSourceFields: FieldDescriptor[] = [
  {
    kind: 'select',
    name: 'source',
    label: 'Which products?',
    width: 'half',
    options: [
      { label: 'Featured products', value: 'featured' },
      { label: 'All published products', value: 'all' },
      { label: 'By category', value: 'category' },
      { label: 'Hand-picked', value: 'selected' },
      { label: 'Latest products', value: 'latest' },
    ],
  },
  { kind: 'number', name: 'limit', label: 'Maximum products', width: 'half', min: 1, max: 12 },
  {
    // Without this the "By category" source above had nothing to filter on:
    // `categoryId` was stored and read by `selectProducts`, but no section
    // using this list offered a way to set it, so choosing "By category"
    // silently listed everything.
    kind: 'productCategory',
    name: 'categoryId',
    label: 'Category',
    width: 'half',
    showWhen: { field: 'source', equals: ['category'] },
  },
  {
    kind: 'products',
    name: 'productIds',
    label: 'Products',
    help: 'Shown in this order.',
    showWhen: { field: 'source', equals: ['selected'] },
  },
];
