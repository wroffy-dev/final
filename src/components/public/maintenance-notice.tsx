import { Wrench } from 'lucide-react';

/**
 * Shown to visitors while the site is in maintenance mode — during a restore,
 * or whenever an admin turns it on.
 *
 * Signed-in staff never see this: whoever is running the restore still needs
 * the site to check the result.
 */
export function MaintenanceNotice({
  siteName,
  logoUrl,
}: {
  siteName: string;
  logoUrl?: string | null;
}) {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- no layout shift budget on a standalone holding page
        <img src={logoUrl} alt={siteName} className="mb-8 h-10 w-auto" />
      ) : null}

      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Wrench className="h-6 w-6" aria-hidden="true" />
      </span>

      <h1 className="font-heading text-2xl font-semibold text-content sm:text-3xl">
        We will be back shortly
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        {siteName} is down for scheduled maintenance. Nothing is wrong on your end — please try
        again in a few minutes.
      </p>
    </main>
  );
}
