import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePartialUser } from '@/lib/auth/guards';
import { ForcedMfaSetup } from '@/components/auth/forced-mfa-setup';
import { SignOutLink } from '@/components/auth/sign-out-link';

export const metadata: Metadata = { title: 'Secure your account' };
export const dynamic = 'force-dynamic';

/**
 * Forced enrolment.
 *
 * Reached when a correct password meets an account with no authenticator. It
 * is not skippable and not a redirect the client can decline: the session is
 * in the `mfa-setup` state server-side, and every admin route refuses it until
 * enrolment completes.
 */
export default async function SetupTwoFactorPage() {
  const { user, status } = await requirePartialUser();

  if (status === 'authenticated') redirect('/admin');
  if (status === 'mfa-pending') redirect('/auth/verify-2fa');

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-heading text-xl font-bold text-content">Secure your account</h1>
        <p className="mt-1.5 text-sm text-muted">
          Microsoft Authenticator is required to access this account.
        </p>
        <p className="mt-1 text-xs text-muted">{user.email}</p>
      </div>

      <ForcedMfaSetup />

      <p className="border-t border-hairline pt-4 text-center text-xs text-muted">
        Not you? <SignOutLink>Sign out</SignOutLink>
      </p>
    </div>
  );
}
