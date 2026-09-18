import type { Metadata } from 'next';
import { getDefaultCountry } from '@/lib/country/registry';
import { blogPostMetadata, BlogPostSurface } from '../../_surfaces/blog';

export const dynamic = 'force-dynamic';

/** The root market's article route. Prefixed markets share the same surface. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, country] = await Promise.all([params, getDefaultCountry()]);
  return blogPostMetadata(country, slug);
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, country] = await Promise.all([params, getDefaultCountry()]);
  return <BlogPostSurface country={country} slug={slug} />;
}
