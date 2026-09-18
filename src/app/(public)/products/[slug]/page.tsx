import type { Metadata } from 'next';
import { getDefaultCountry } from '@/lib/country/registry';
import { productMetadata, ProductSurface } from '../../_surfaces/product';

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

/** The root market's product route. Prefixed markets share the same surface. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, country] = await Promise.all([params, getDefaultCountry()]);
  return productMetadata(country, slug);
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, country] = await Promise.all([params, getDefaultCountry()]);
  return <ProductSurface country={country} slug={slug} />;
}
