'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Laptop, LogOut, RefreshCw, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatRelative } from '@/lib/utils/format';
import { changeMyPassword, revokeMyOtherSessions, revokeMySession } from '@/lib/actions/profile';
import { startMfaEnrollment, resetMyMfa, regenerateMyRecoveryCodes } from '@/lib/actions/mfa';
import { MfaSetupPanel, type EnrollmentOffer } from '@/components/auth/mfa-setup-panel';
import { RecoveryCodesPanel } from '@/components/auth/recovery-codes-panel';
import { OtpInput } from '@/components/auth/otp-input';
import type { ProfileData } from '@/lib/services/profile';

/**
 * Password, authenticator, recovery codes and signed-in devices.
 *
 * Everything that changes a credential asks for the current password, and
 * anything that touches an existing authenticator also asks for a live code
 * from it — so a session left open on an unattended machine is not enough to
 * take the account over.
 */
export function SecurityTab({ data }: { data: ProfileData }) {
  return (
    <div className="space-y-4">
      <ChangePasswordCard passwordChangedAt={data.profile.passwordChangedAt} />
      <AuthenticatorCard mfa={data.mfa} />
      <RecoveryCodesCard mfa={data.mfa} />
      <SessionsCard sessions={data.sessions} />
    </div>
  );
}

function ChangePasswordCard({ passwordChangedAt }: { passwordChangedAt: string | null }) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);

    const result = await changeMyPassword(form);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setError(result.error);
      return;
    }

    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    toast(result.message ?? 'Password changed.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Change password"
        description={
          passwordChangedAt
            ? `Last changed ${formatDate(passwordChangedAt, true)}.`
            : 'Your password has not been changed since the account was created.'
        }
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Field label="Current password" htmlFor="pw-current" required>
            <Input
              id="pw-current"
              type="password"
              value={form.currentPassword}
              onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
              autoComplete="current-password"
            />
          </Field>

          <Field
            label="New password"
            htmlFor="pw-new"
            required
            error={errors.newPassword}
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
          >
            <Input
              id="pw-new"
              type="password"
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              autoComplete="new-password"
            />
          </Field>

          <Field
            label="Confirm new password"
            htmlFor="pw-confirm"
            required
            error={errors.confirmPassword}
          >
            <Input
              id="pw-confirm"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              autoComplete="new-password"
            />
          </Field>

          <p className="text-xs text-muted">
            Changing your password signs you out everywhere except this device.
          </p>
        </CardBody>
        <CardFooter>
          <Button
            type="submit"
            disabled={
              saving || !form.currentPassword || !form.newPassword || !form.confirmPassword
            }
          >
            {saving ? 'Changing…' : 'Change password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function AuthenticatorCard({ mfa }: { mfa: ProfileData['mfa'] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [setupOpen, setSetupOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  // Shared by both dialogs; cleared by finish() so one cannot leak into the other.
  const [offer, setOffer] = React.useState<EnrollmentOffer | null>(null);

  function finish() {
    setSetupOpen(false);
    setResetOpen(false);
    setOffer(null);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Microsoft Authenticator"
          description="A 6-digit code from your phone, required every time you sign in."
          actions={
            mfa.enabled ? (
              <Badge tone="success">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Enabled
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
          {!mfa.serverConfigured ? (
            <Alert tone="danger" title="Two-step verification is not configured on this server">
              MFA_ENCRYPTION_KEY is missing. Contact your administrator — nobody can enrol until it
              is set.
            </Alert>
          ) : null}

          {mfa.enabled ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Configured on</dt>
                <dd className="mt-0.5 text-content">{formatDate(mfa.configuredAt, true)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Last verified</dt>
                <dd className="mt-0.5 text-content">{formatDate(mfa.lastVerifiedAt, true)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted">
              Two-step verification is required on this account. You will be asked to set it up at
              your next sign-in if you do not do it here.
            </p>
          )}
        </CardBody>
        <CardFooter>
          {mfa.enabled ? (
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reset Microsoft Authenticator
            </Button>
          ) : (
            <Button onClick={() => setSetupOpen(true)} disabled={!mfa.serverConfigured}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Set up Microsoft Authenticator
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog
        open={setupOpen}
        onClose={finish}
        title={offer ? 'Scan the QR code' : 'Set up Microsoft Authenticator'}
        description={
          offer
            ? 'Scan it with the app, then enter the 6 digits it shows.'
            : 'Confirm your password before adding an authenticator to this account.'
        }
        size="md"
      >
        {offer ? (
          <MfaSetupPanel offer={offer} onEnrolled={finish} doneLabel="Done" />
        ) : (
          // Password-gated even though the account has no authenticator yet: a
          // borrowed, already-signed-in browser must not be able to attach a
          // second factor the real owner does not hold.
          <ReauthForm
            submitLabel="Continue"
            tone="primary"
            requireToken={false}
            note="You will scan a QR code on the next step."
            onSubmit={async ({ currentPassword }) => {
              const result = await startMfaEnrollment(currentPassword);
              if (!result.ok) return result.error;
              setOffer(result.data ?? null);
              return null;
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={finish}
        title={offer ? 'Scan the new QR code' : 'Reset Microsoft Authenticator'}
        description={
          offer
            ? 'Your previous authenticator and recovery codes have already stopped working.'
            : 'Confirm it is you, then set up a new authenticator.'
        }
        size="md"
      >
        {offer ? (
          <MfaSetupPanel offer={offer} onEnrolled={finish} doneLabel="Done" />
        ) : (
          <ReauthForm
            submitLabel="Reset authenticator"
            note="Your current authenticator and all recovery codes stop working immediately, and other devices are signed out."
            onSubmit={async (values) => {
              const result = await resetMyMfa(values);
              if (!result.ok) return result.error;
              setOffer(result.data ?? null);
              toast('Old authenticator removed. Scan the new code to finish.');
              return null;
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function RecoveryCodesCard({ mfa }: { mfa: ProfileData['mfa'] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [codes, setCodes] = React.useState<string[] | null>(null);

  function finish() {
    setOpen(false);
    setCodes(null);
    router.refresh();
  }

  const low = mfa.enabled && mfa.recoveryCodesRemaining <= 3;

  return (
    <>
      <Card>
        <CardHeader
          title="Recovery codes"
          description="Single-use codes for when your phone is not available."
        />
        <CardBody className="space-y-3">
          {mfa.enabled ? (
            <>
              <p className="text-sm text-content">
                Recovery codes remaining:{' '}
                <span className="font-semibold">{mfa.recoveryCodesRemaining}</span>
              </p>
              {low ? (
                <Alert tone="warning">
                  You are running low. Generate a new set so you are not locked out.
                </Alert>
              ) : null}
              <p className="text-xs text-muted">
                Existing codes cannot be shown again. Generating a new set invalidates every
                previous code.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Recovery codes are issued when you set up Microsoft Authenticator.
            </p>
          )}
        </CardBody>
        {mfa.enabled ? (
          <CardFooter>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Regenerate recovery codes
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Dialog
        open={open}
        onClose={finish}
        title={codes ? 'Your new recovery codes' : 'Regenerate recovery codes'}
        size="md"
      >
        {codes ? (
          <RecoveryCodesPanel codes={codes} onDone={finish} doneLabel="Done" />
        ) : (
          <ReauthForm
            submitLabel="Generate new codes"
            note="Every code you currently hold stops working."
            onSubmit={async (values) => {
              const result = await regenerateMyRecoveryCodes(values);
              if (!result.ok) return result.error;
              setCodes(result.data?.recoveryCodes ?? []);
              return null;
            }}
          />
        )}
      </Dialog>
    </>
  );
}

/**
 * Password plus a live code — the re-authentication both destructive MFA
 * actions require. Returns an error string, or null on success.
 */
function ReauthForm({
  submitLabel,
  note,
  onSubmit,
  requireToken = true,
  tone = 'danger',
}: {
  submitLabel: string;
  note: string;
  onSubmit: (values: { currentPassword: string; token: string }) => Promise<string | null>;
  /** False before a first enrolment, when there is no authenticator to ask. */
  requireToken?: boolean;
  tone?: 'danger' | 'primary';
}) {
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [token, setToken] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const message = await onSubmit({ currentPassword, token });
    setPending(false);
    if (message) {
      setError(message);
      setToken('');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert tone={tone === 'danger' ? 'warning' : 'info'}>{note}</Alert>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <Field label="Current password" htmlFor="reauth-password" required>
        <Input
          id="reauth-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
      </Field>

      {requireToken ? (
        <Field label="Code from Microsoft Authenticator" htmlFor="reauth-otp" required>
          <OtpInput id="reauth-otp" value={token} onChange={setToken} disabled={pending} />
        </Field>
      ) : null}

      <Button
        type="submit"
        variant={tone}
        className="w-full"
        disabled={pending || !currentPassword || (requireToken && token.length !== 6)}
      >
        {pending ? 'Working…' : submitLabel}
      </Button>
    </form>
  );
}

function SessionsCard({ sessions }: { sessions: ProfileData['sessions'] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<string | null>(null);

  const others = sessions.filter((session) => !session.current);

  async function signOutOthers() {
    setPending('all');
    const result = await revokeMyOtherSessions();
    setPending(null);
    toast(result.ok ? (result.message ?? 'Done.') : result.error, result.ok ? 'success' : 'error');
    router.refresh();
  }

  async function signOutOne(id: string) {
    setPending(id);
    const result = await revokeMySession(id);
    setPending(null);
    toast(result.ok ? (result.message ?? 'Done.') : result.error, result.ok ? 'success' : 'error');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Signed-in devices"
        description="Everywhere your account currently has an active session."
        actions={
          others.length > 0 ? (
            <Button variant="outline" size="sm" onClick={signOutOthers} disabled={pending !== null}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out other devices
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">No active sessions recorded.</p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline px-3.5 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/10 text-muted">
                {isMobile(session.userAgent) ? (
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Laptop className="h-4 w-4" aria-hidden="true" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">
                  {describeAgent(session.userAgent)}
                  {session.current ? (
                    <Badge tone="brand" className="ml-2">
                      This device
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  Signed in {formatDate(session.createdAt, true)} · active{' '}
                  {formatRelative(session.lastSeenAt)}
                  {session.mfaMethod === 'RECOVERY_CODE' ? ' · verified with a recovery code' : ''}
                </p>
              </div>

              {!session.current ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOutOne(session.id)}
                  disabled={pending !== null}
                >
                  Sign out
                </Button>
              ) : null}
            </div>
          ))
        )}
        <p className="pt-1 text-xs text-muted">
          IP addresses are stored only as a salted hash, so they are not shown here.
        </p>
      </CardBody>
    </Card>
  );
}

function isMobile(agent: string | null): boolean {
  return /Mobile|Android|iPhone|iPad/i.test(agent ?? '');
}

/**
 * A readable name from a user-agent string.
 *
 * Order matters: Edge and Chrome both claim to be Safari, and Edge also claims
 * to be Chrome, so the most specific match has to be tested first.
 */
function describeAgent(agent: string | null): string {
  if (!agent) return 'Unknown device';

  const browser =
    /Edg\//.test(agent) ? 'Edge'
    : /OPR\//.test(agent) ? 'Opera'
    : /Firefox\//.test(agent) ? 'Firefox'
    : /Chrome\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) ? 'Safari'
    : 'Browser';

  const platform =
    /Windows/.test(agent) ? 'Windows'
    : /Android/.test(agent) ? 'Android'
    : /iPhone|iPad|iOS/.test(agent) ? 'iOS'
    : /Mac OS X/.test(agent) ? 'macOS'
    : /Linux/.test(agent) ? 'Linux'
    : 'Unknown platform';

  return `${browser} on ${platform}`;
}
