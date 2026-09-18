'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/icons';
import { verifyLoginMfa, verifyRecoveryCode } from '@/lib/actions/mfa';
import { OtpInput } from './otp-input';

/**
 * Code entry at sign-in, with the recovery-code fallback.
 *
 * Both paths call server actions that check the session's state for
 * themselves; this component only decides what to show. A failure never says
 * whether the code was wrong or the window had passed.
 */
export function VerifyMfaForm({ hasRecoveryCodes }: { hasRecoveryCodes: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'totp' | 'recovery'>('totp');
  const [token, setToken] = React.useState('');
  const [recovery, setRecovery] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function onVerified() {
    router.replace('/admin');
    router.refresh();
  }

  const submitTotp = React.useCallback(
    async (code: string) => {
      setPending(true);
      setError(null);
      const result = await verifyLoginMfa(code);
      setPending(false);

      if (!result.ok) {
        setError(result.error);
        setToken('');
        return;
      }
      onVerified();
    },
    // onVerified closes over router only, which is stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function submitRecovery(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await verifyRecoveryCode(recovery);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onVerified();
  }

  if (mode === 'recovery') {
    return (
      <form onSubmit={submitRecovery} className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <Field
          label="Recovery code"
          htmlFor="recovery-code"
          required
          hint="One of the codes you saved when you set up the authenticator. Each works once."
        >
          <Input
            id="recovery-code"
            value={recovery}
            onChange={(event) => setRecovery(event.target.value)}
            placeholder="ABCD-EFGH-IJKL"
            autoComplete="one-time-code"
            spellCheck={false}
            autoFocus
            className="font-mono tracking-wider"
            disabled={pending}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={pending || !recovery.trim()}>
          {pending ? (
            <>
              <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking…
            </>
          ) : (
            'Use recovery code'
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode('totp');
            setError(null);
          }}
          className="block w-full text-center text-xs font-medium text-brand underline-offset-2 hover:underline"
        >
          Back to the authenticator code
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (token.length === 6) void submitTotp(token);
      }}
      className="space-y-4"
    >
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <Field label="Verification code" htmlFor="login-otp" required>
        <OtpInput
          id="login-otp"
          value={token}
          onChange={setToken}
          onComplete={(code) => void submitTotp(code)}
          disabled={pending}
          autoFocus
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending || token.length !== 6}>
        {pending ? (
          <>
            <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
            Verifying…
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Verify
          </>
        )}
      </Button>

      {hasRecoveryCodes ? (
        <div className="border-t border-hairline pt-4 text-center">
          <p className="text-xs text-muted">Can&rsquo;t access Microsoft Authenticator?</p>
          <button
            type="button"
            onClick={() => {
              setMode('recovery');
              setError(null);
            }}
            className="mt-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            Use a recovery code
          </button>
        </div>
      ) : (
        <p className="border-t border-hairline pt-4 text-center text-xs text-muted">
          Lost your authenticator and have no recovery codes left? Ask an administrator to reset it.
        </p>
      )}
    </form>
  );
}
