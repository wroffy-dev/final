/**
 * System field context.
 *
 * A form can carry fields whose value is not typed by the visitor but injected
 * from where the form appears — which product is being enquired about, which
 * plan, which SKU. An admin marks such a field "System" in the builder and
 * names it after one of the keys below.
 *
 * The value is resolved on the server from the trusted product id that came
 * with the submission, never from the payload. That distinction is the whole
 * point: an admin can add a `product_name` field to any form without creating a
 * way for a crafted request to claim an enquiry is about a different product.
 */

export const SYSTEM_FIELD_KEYS = [
  'product_id',
  'product_name',
  'product_slug',
  'product_sku',
  'plan',
  'billing_period',
  'price',
] as const;

export type SystemFieldKey = (typeof SYSTEM_FIELD_KEYS)[number];

export const SYSTEM_FIELD_LABELS: Record<SystemFieldKey, string> = {
  product_id: 'Product ID',
  product_name: 'Product name',
  product_slug: 'Product slug',
  product_sku: 'SKU',
  plan: 'Plan',
  billing_period: 'Billing period',
  price: 'Price',
};

const KEY_SET: ReadonlySet<string> = new Set(SYSTEM_FIELD_KEYS);

export function isSystemFieldKey(name: string): name is SystemFieldKey {
  return KEY_SET.has(name);
}

/** What a product contributes. Only strings — these land in a JSON payload. */
export type SystemContext = Partial<Record<SystemFieldKey, string>>;

export type ProductContextSource = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  billingPeriod: string;
  priceSuffix: string | null;
  monthlyPrice: unknown;
  annualPrice: unknown;
};

/**
 * Builds the context from a product row.
 *
 * `plan` is the product name: on this site a product *is* a plan (Business
 * Standard, Advanced), so an admin adding a field called `plan` means the same
 * thing and should not have to know which of the two names to use.
 */
export function productContext(product: ProductContextSource): SystemContext {
  const price = product.monthlyPrice ?? product.annualPrice;

  return {
    product_id: product.id,
    product_name: product.name,
    product_slug: product.slug,
    product_sku: product.sku ?? '',
    plan: product.name,
    billing_period: product.billingPeriod,
    price: price === null || price === undefined ? '' : String(price),
  };
}
