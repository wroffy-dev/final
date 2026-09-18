'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils/format';
import { adminResetUserMfa } from '@/lib/actions/staff';

/**
 * The administrator's side of two-factor authentication.
 *
 * Exactly one action, and it only ever removes a credential: there is no way
 * from here to see a secret, issue a code or sign in as the user. That keeps
 * "help, I've lost my phone" solvable without creating a way to take an
 * account over.
 */
export function StaffSecurityCard({
  member,
  canReset,
}: {
  member: {
    id: string;
    name: string;
    twoFactorEnabled: boolean;
    twoFactorVerifiedAt: string | null;
    twoFactorLastUsedAt: string | null;
    recoveryCodesRemaining: number;
  };
  canReset: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function reset() {
    setPending(true);
    const result = await adminResetUserMfa(member.id);
    setPending(false);
    setConfirming(false);

    toast(result.ok ? (result.message ?? 'Done.') : result.error, result.ok ? 'success' : 'error');
    if (result.ok) router.refresh();
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader
          title="Security"
          description="Two-step verification for this account."
          actions={
            member.twoFactorEnabled ? (
              <Badge tone="success">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Authenticator enabled
              </Badge>
            ) : (
              <Badge tone="warning">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Not set up
              </Badge>
            )
          }
        />
        <CardBody className="space-y-4">
          {member.twoFactorEnabled ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Configured on</dt>
                <dd className="mt-0.5 text-content">
                  {formatDate(member.twoFactorVerifiedAt, true)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Last verified</dt>
                <dd className="mt-0.5 text-content">
                  {formatDate(member.twoFactorLastUsedAt, true)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Recovery codes left</dt>
                <dd className="mt-0.5 text-content">{member.recoveryCodesRemaining}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted">
              This user will be required to set up Microsoft Authenticator at their next sign-in.
            </p>
          )}

          {canReset && member.twoFactorEnabled ? (
            <Alert tone="warning" title="Only when they have genuinely lost access">
              A reset removes the second factor from this account. Confirm who you are speaking to
              before using it — over a channel other than the email address on the account.
            </Alert>
          ) : null}
        </CardBody>

        {canReset ? (
          <CardFooter>
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={pending || !member.twoFactorEnabled}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reset Microsoft Authenticator
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={reset}
        pending={pending}
        title={`Reset ${member.name}'s authenticator?`}
        message="Their authenticator and every recovery code stop working, and all their sessions are signed out. They will set up a new authenticator at their next sign-in."
        confirmLabel="Reset authenticator"
      />
    </>
  );
}
