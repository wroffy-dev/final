import type { Metadata } from 'next';
import { getDefaultCountry } from '@/lib/country/registry';
import {
  blogCategoryMetadata,
  BlogCategorySurface,
  type BlogSearchParams,
} from '../../../_surfaces/blog';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<BlogSearchParams>;

/** The root market's category archive. Prefixed markets share the same surface. */
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
  return blogCategoryMetadata(country, slug, query);
}

export default async function CategoryArchive({
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
  return <BlogCategorySurface country={country} slug={slug} searchParams={query} />;
}
