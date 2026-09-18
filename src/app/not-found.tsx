import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { getRequestCountry } from '@/lib/country/request';
import { countryPath } from '@/lib/country/routing';

/**
 * The 404 page, in the market the visitor was browsing.
 *
 * A missing page in one market is never answered with another market's content
 * — that would show the wrong prices and the wrong contact details — so this is
 * where a wrong UAE URL lands, and both routes out of it stay inside the UAE.
 */
export default async function NotFound() {
  // The market is a nicety here, not a requirement: a 404 must render even if
  // the database is unreachable.
  const country = await getRequestCountry().catch(() => null);
  const home = country ? countryPath(country) : '/';
  const contact = country ? countryPath(country, 'contact') : '/contact';

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-20">
      <div className="max-w-md text-center">
        <p className="font-heading text-6xl font-bold text-brand">404</p>
        <h1 className="mt-4 font-heading text-2xl font-bold text-content">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The page you were looking for has moved or no longer exists. Try the homepage, or get in touch and
          we will point you in the right direction.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={home} className={buttonClasses('primary', 'md')}>
            Back to homepage
          </Link>
          <Link href={contact} className={buttonClasses('outline', 'md')}>
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}
