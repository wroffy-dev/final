'use client';

import * as React from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { Spinner } from '@/components/ui/icons';
import { startMfaEnrollment, confirmMfaEnrollment } from '@/lib/actions/mfa';
import { OtpInput } from './otp-input';
import { RecoveryCodesPanel } from './recovery-codes-panel';

/**
 * Microsoft Authenticator enrolment.
 *
 * The one implementation. The forced-onboarding screen and the Password &
 * Security tab both render this, and both call the same two server actions, so
 * there is no way for the two flows to disagree about what counts as enrolled.
 *
 * `offer` lets a caller that has already produced a QR code (the self-service
 * reset, which must re-authenticate first) hand it straight in rather than
 * starting a second enrolment.
 */

export type EnrollmentOffer = {
  qrDataUri: string;
  manualKey: string;
  accountLabel: string;
  issuer: string;
};

type Stage = 'idle' | 'scanning' | 'codes';

export function MfaSetupPanel({
  autoStart = false,
  offer: initialOffer = null,
  onEnrolled,
  doneLabel,
}: {
  /** Begin enrolment on mount — used by the forced onboarding screen. */
  autoStart?: boolean;
  offer?: EnrollmentOffer | null;
  onEnrolled?: () => void;
  doneLabel?: string;
}) {
  const [offer, setOffer] = React.useState<EnrollmentOffer | null>(initialOffer);
  const [stage, setStage] = React.useState<Stage>(initialOffer ? 'scanning' : 'idle');
  const [token, setToken] = React.useState('');
  const [codes, setCodes] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [showKey, setShowKey] = React.useState(false);

  const begin = React.useCallback(async () => {
    setPending(true);
    setError(null);
    const result = await startMfaEnrollment();
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOffer(result.data ?? null);
    setStage('scanning');
  }, []);

  const started = React.useRef(false);
  React.useEffect(() => {
    if (!autoStart || initialOffer || started.current) return;
    started.current = true;
    void begin();
  }, [autoStart, initialOffer, begin]);

  React.useEffect(() => {
    if (initialOffer) {
      setOffer(initialOffer);
      setStage('scanning');
    }
  }, [initialOffer]);

  const verify = React.useCallback(async (code: string) => {
    setPending(true);
    setError(null);
    const result = await confirmMfaEnrollment(code);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setToken('');
      return;
    }
    setCodes(result.data?.recoveryCodes ?? []);
    setStage('codes');
  }, []);

  if (stage === 'codes') {
    return (
      <RecoveryCodesPanel
        codes={codes}
        onDone={onEnrolled}
        doneLabel={doneLabel ?? 'Continue'}
      />
    );
  }

  if (stage === 'idle' || !offer) {
    return (
      <div className="space-y-4">
        {error ? (
          <Alert tone="danger" title="Setup could not start">
            {error}
          </Alert>
        ) : null}
        <Button onClick={begin} disabled={pending}>
          {pending ? (
            <>
              <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
              Preparing…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Set up Microsoft Authenticator
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-1.5 text-sm text-muted">
        <li>1. Open Microsoft Authenticator.</li>
        <li>
          2. Tap <span className="font-medium text-content">+</span>.
        </li>
        <li>
          3. Select <span className="font-medium text-content">Other account</span>.
        </li>
        <li>4. Scan the QR code below.</li>
        <li>5. Enter the 6-digit code it shows.</li>
      </ol>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-muted/[0.03] p-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, never a remote asset */}
        <img
          src={offer.qrDataUri}
          alt="QR code for Microsoft Authenticator"
          width={192}
          height={192}
          className="h-48 w-48 rounded-lg bg-white p-2"
        />
        <p className="text-center text-xs text-muted">
          Account
          <br />
          <span className="font-medium text-content">{offer.accountLabel}</span>
        </p>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowKey((value) => !value)}
          className="text-xs font-medium text-brand underline-offset-2 hover:underline"
          aria-expanded={showKey}
        >
          {showKey ? 'Hide setup key' : "Can't scan the QR code?"}
        </button>
        {showKey ? (
          <div className="mt-2 rounded-lg border border-hairline bg-muted/[0.04] p-3">
            <p className="text-xs text-muted">Enter this key in the app instead:</p>
            <code className="mt-1 block break-all font-mono text-sm tracking-wide text-content">
              {offer.manualKey}
            </code>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (token.length === 6) void verify(token);
        }}
        className="space-y-3"
      >
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <Field label="Verification code" htmlFor="setup-otp" required>
          <OtpInput
            id="setup-otp"
            value={token}
            onChange={setToken}
            onComplete={(code) => void verify(code)}
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
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Verify &amp; enable
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
