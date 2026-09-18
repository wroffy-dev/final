import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePartialUser } from '@/lib/auth/guards';
import { countRemainingRecoveryCodes } from '@/lib/mfa/mfa.service';
import { VerifyMfaForm } from '@/components/auth/verify-mfa-form';
import { SignOutLink } from '@/components/auth/sign-out-link';

export const metadata: Metadata = { title: 'Two-step verification' };
export const dynamic = 'force-dynamic';

/**
 * The sign-in challenge.
 *
 * The session already holds a correct password and nothing else. It stays that
 * way until a code is verified on the server, so nothing here — including a
 * user who navigates straight to /admin — can shortcut it.
 */
export default async function VerifyTwoFactorPage() {
  const { user, status } = await requirePartialUser();

  if (status === 'authenticated') redirect('/admin');
  if (status === 'mfa-setup') redirect('/auth/setup-2fa');

  const recoveryCodesRemaining = await countRemainingRecoveryCodes(user.id);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-heading text-xl font-bold text-content">Two-step verification</h1>
        <p className="mt-1.5 text-sm text-muted">
          Open Microsoft Authenticator and enter the 6-digit code.
        </p>
        <p className="mt-1 text-xs text-muted">{user.email}</p>
      </div>

      <VerifyMfaForm hasRecoveryCodes={recoveryCodesRemaining > 0} />

      <p className="border-t border-hairline pt-4 text-center text-xs text-muted">
        Not you? <SignOutLink>Sign out</SignOutLink>
      </p>
    </div>
  );
}
