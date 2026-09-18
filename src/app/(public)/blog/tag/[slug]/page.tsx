import type { Metadata } from 'next';
import { getDefaultCountry } from '@/lib/country/registry';
import { blogTagMetadata, BlogTagSurface, type BlogSearchParams } from '../../../_surfaces/blog';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<BlogSearchParams>;

/** The root market's tag archive. Prefixed markets share the same surface. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, query, country] = await Promise.all([
    params,
    searchParams,
    getDefaultCountry(),
  ]);
  return blogTagMetadata(country, slug, query);
}

export default async function TagArchive({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, query, country] = await Promise.all([
    params,
    searchParams,
    getDefaultCountry(),
  ]);
  return <BlogTagSurface country={country} slug={slug} searchParams={query} />;
}
