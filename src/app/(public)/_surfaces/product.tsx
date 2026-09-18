import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Check, ChevronRight } from 'lucide-react';
import {
  getPublicProduct,
  selectProducts,
  getProductSeo,
  findLiveProductCountries,
} from '@/lib/services/products';
import { getMediaByIds } from '@/lib/services/media';
import { getWebsiteSettings } from '@/lib/services/settings';
import { buildMetadata, absoluteCountryUrl } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { countryBreadcrumbSchema, productSchema } from '@/lib/seo/structured-data';
import { formatMoney } from '@/lib/utils/money';
import { RichText } from '@/components/cms/blocks/shared';
import { ProductCta } from '@/components/products/product-cta';
import { ProductCard } from '@/components/products/product-card';
import { countryPath } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';

/**
 * A product page, in one market.
 *
 * Identity, specification and imagery come from the global product; price,
 * currency, availability, local copy and SEO come from that market's
 * `ProductCountry` row — which is also what decides whether the page exists
 * there at all.
 */

export async function productMetadata(
  country: CountryContext,
  slug: string,
): Promise<Metadata> {
  const [row, alternates] = await Promise.all([
    getProductSeo(country.id, slug),
    findLiveProductCountries(slug),
  ]);
  if (!row) return { title: 'Product not found', robots: { index: false, follow: false } };

  const product = row.product;

  return buildMetadata({
    title: row.seoTitle || product.seoTitle || product.name,
    description: row.seoDescription || product.seoDescription || product.shortDescription,
    path: `/products/${slug}`,
    country,
    alternateCountryIds: alternates,
    canonicalUrl: row.canonicalUrl || product.canonicalUrl,
    noIndex: row.noIndex || product.noIndex,
    ogImageUrl: row.ogImage?.url ?? product.ogImage?.url ?? product.image?.url ?? null,
    type: 'product',
  });
}

export async function ProductSurface({
  country,
  slug,
}: {
  country: CountryContext;
  slug: string;
}) {
  const [product, site] = await Promise.all([
    getPublicProduct(country, slug),
    getWebsiteSettings(),
  ]);
  if (!product) notFound();

  const [related, gallery] = await Promise.all([
    selectProducts(country, { source: 'featured', limit: 4 }).then((rows) =>
      rows.filter((p) => p.id !== product.id).slice(0, 3),
    ),
    getMediaByIds(product.galleryIds),
  ]);

  // Preserve the order the admin arranged in the gallery picker.
  const galleryImages = product.galleryIds
    .map((id) => gallery.get(id))
    .filter((image): image is NonNullable<typeof image> => Boolean(image));

  return (
    <>
      <nav aria-label="Breadcrumb" className="border-b border-hairline bg-muted/[0.03]">
        <ol className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 py-3 text-xs text-muted sm:px-6">
          <li>
            <Link href={countryPath(country)} className="hover:text-brand">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <li>
            <Link href={countryPath(country, 'pricing')} className="hover:text-brand">
              Plans
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <li aria-current="page" className="font-medium text-content">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <div>
            {product.categoryName ? (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                {product.categoryName}
              </p>
            ) : null}
            <h1 className="mt-3 font-heading text-3xl tracking-tight text-content sm:text-4xl lg:text-5xl">
              {product.name}
            </h1>
            {product.shortDescription ? (
              <p className="mt-4 text-lg leading-relaxed text-muted">{product.shortDescription}</p>
            ) : null}

            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.imageAlt ?? product.name}
                width={900}
                height={560}
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="mt-8 h-auto w-full rounded-2xl border border-hairline object-cover"
              />
            ) : null}

            {galleryImages.length > 0 ? (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {galleryImages.map((image) => (
                  <li key={image.id}>
                    <Image
                      src={image.url}
                      alt={image.altText}
                      width={image.width ?? 400}
                      height={image.height ?? 300}
                      sizes="(max-width: 640px) 50vw, 200px"
                      className="h-auto w-full rounded-lg border border-hairline object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <RichText html={product.description} className="mt-10" />

            {product.features.length > 0 ? (
              <section className="mt-12" aria-labelledby="features-heading">
                <h2 id="features-heading" className="font-heading text-xl font-bold text-content">
                  What is included
                </h2>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-sm text-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {product.benefits.length > 0 ? (
              <section className="mt-12" aria-labelledby="benefits-heading">
                <h2 id="benefits-heading" className="font-heading text-xl font-bold text-content">
                  Why teams choose it
                </h2>
                <ul className="mt-5 space-y-3">
                  {product.benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-sm text-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
              {product.monthlyPrice ? (
                <>
                  <p className="flex items-baseline gap-1.5">
                    <span className="font-heading text-4xl font-bold tracking-tight text-content">
                      {formatMoney(product.monthlyPrice, product.currency)}
                    </span>
                    <span className="text-sm text-muted">/month</span>
                  </p>
                  {product.priceSuffix ? <p className="mt-1 text-xs text-muted">{product.priceSuffix}</p> : null}
                  {product.annualPrice ? (
                    <p className="mt-2 text-sm text-muted">
                      or <strong className="text-content">{formatMoney(product.annualPrice, product.currency)}</strong>{' '}
                      billed annually
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="font-heading text-2xl font-bold text-content">
                  {product.priceNote || 'Custom pricing'}
                </p>
              )}

              <ProductCta product={product} size="lg" className="mt-6 w-full" ctaLocation="product-page" />

              {product.specs.length > 0 ? (
                <dl className="mt-6 divide-y divide-hairline border-t border-hairline text-sm">
                  {product.specs.map((spec, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="text-muted">{spec.label}</dt>
                      <dd className="text-right font-medium text-content">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <p className="mt-6 text-xs leading-relaxed text-muted">
                Prices exclude applicable taxes. {site.siteName} is an authorised reseller — you receive the same
                product with local billing and support.
              </p>
            </div>
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-20" aria-labelledby="related-heading">
            <h2 id="related-heading" className="font-heading text-2xl font-bold text-content">
              Other plans
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} ctaLocation="product-related" />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <JsonLd
        data={[
          productSchema({
            name: product.name,
            description: product.shortDescription,
            url: absoluteCountryUrl(country, `products/${product.slug}`),
            imageUrl: product.imageUrl,
            price: product.monthlyPrice,
            currency: product.currency,
            sku: product.sku,
            brand: site.siteName,
          }),
          countryBreadcrumbSchema(country, [
            { name: 'Home', path: '' },
            { name: 'Plans', path: 'pricing' },
            { name: product.name, path: `products/${product.slug}` },
          ]),
        ]}
      />
    </>
  );
}
