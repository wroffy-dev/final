import type { Metadata } from 'next';
import Link from 'next/link';
import { getWebsiteSettings } from '@/lib/services/settings';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Chrome for the two screens that stand between a password and a session.
 *
 * Deliberately not the admin shell: a half-authenticated session must not see
 * the sidebar, the search or anything else the admin layout loads, and reusing
 * that layout would mean one careless change could expose it.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const site = await getWebsiteSettings();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/[0.04] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            {site.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt={site.siteName} className="h-9 w-auto object-contain" />
            ) : (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-bold text-white">
                  {site.siteName.charAt(0).toUpperCase()}
                </span>
                <span className="font-heading text-lg font-bold text-content">{site.siteName}</span>
              </>
            )}
          </Link>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
