import type { Metadata } from 'next';
import Link from 'next/link';
import { getWebsiteSettings } from '@/lib/services/settings';
import { LoginForm } from '@/components/admin/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const [params, site] = await Promise.all([searchParams, getWebsiteSettings()]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/[0.04] px-4 py-12">
      <div className="w-full max-w-sm">
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
          <h1 className="mt-6 font-heading text-xl font-bold text-content">Sign in to the admin</h1>
          <p className="mt-1.5 text-sm text-muted">Manage your website, products and pipeline.</p>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
          <LoginForm
            callbackUrl={params.callbackUrl ?? '/admin'}
            initialError={params.error ? 'Sign-in failed. Check your details and try again.' : null}
          />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="hover:text-brand">
            ← Back to website
          </Link>
        </p>
      </div>
    </div>
  );
}
