import { NextResponse } from 'next/server';
import { getSeoSettings } from '@/lib/services/settings';
import { childUrls, renderUrlset } from '@/lib/seo/sitemap';

/**
 * One child sitemap: a market's content, or the root-only blog.
 *
 * `/sitemaps/root.xml`, `/sitemaps/ae.xml`, `/sitemaps/blog.xml`. A name that
 * matches no market, or a market excluded from the sitemaps, is a 404 rather
 * than an empty file — an empty urlset would look like "this market has
 * nothing", which is a different claim from "there is no such sitemap".
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const seo = await getSeoSettings().catch(() => null);
  if (seo && !seo.sitemapEnabled) {
    return new NextResponse('Sitemaps are disabled.', { status: 404 });
  }

  const { name } = await params;
  const clean = name.replace(/\.xml$/i, '');
  // The name is a market prefix or "blog"; anything else cannot address a file.
  if (!/^[a-z0-9-]{1,32}$/i.test(clean)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const urls = await childUrls(clean);
    if (!urls) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(renderUrlset(urls), {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error) {
    console.error('[sitemap] child generation failed', error);
    return new NextResponse('Sitemap temporarily unavailable.', { status: 503 });
  }
}
