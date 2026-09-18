import { NextResponse } from 'next/server';
import { getSeoSettings } from '@/lib/services/settings';
import { renderIndex, sitemapChildren } from '@/lib/seo/sitemap';

/**
 * The sitemap index.
 *
 * `/sitemap.xml` is the URL search engines and the previous implementation
 * both already know, so it keeps it — it now lists the per-market files rather
 * than holding every URL itself.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const seo = await getSeoSettings().catch(() => null);
  if (seo && !seo.sitemapEnabled) {
    return new NextResponse('Sitemaps are disabled.', { status: 404 });
  }

  try {
    const children = await sitemapChildren();
    return xml(renderIndex(children));
  } catch (error) {
    console.error('[sitemap] index generation failed', error);
    return new NextResponse('Sitemap temporarily unavailable.', { status: 503 });
  }
}

function xml(body: string) {
  return new NextResponse(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
