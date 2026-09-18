'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Six-digit code entry.
 *
 * One real input rather than six boxes: six inputs look neater but break paste
 * from a password manager, confuse screen readers, and fight mobile keyboards.
 * This keeps a single labelled field, styles it as a code, and accepts a
 * pasted code whatever punctuation comes with it.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  id,
  autoFocus,
  label = 'Verification code',
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fires once when the sixth digit arrives, for auto-submit. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const completed = React.useRef<string | null>(null);

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    onChange(digits);

    if (digits.length === 6) {
      // Guard against firing twice for the same code if the user edits and
      // retypes the last digit.
      if (completed.current !== digits) {
        completed.current = digits;
        onComplete?.(digits);
      }
    } else {
      completed.current = null;
    }
  }

  return (
    <input
      id={id}
      name="token"
      value={value}
      onChange={(event) => handle(event.target.value)}
      onPaste={(event) => {
        event.preventDefault();
        handle(event.clipboardData.getData('text'));
      }}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      aria-label={label}
      placeholder="000000"
      className={cn(
        'w-full rounded-lg border border-hairline bg-surface px-3 py-3 text-center',
        'font-mono text-2xl tracking-[0.5em] text-content shadow-sm',
        'placeholder:text-muted/40 transition-colors',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25',
        'disabled:cursor-not-allowed disabled:bg-muted/5',
      )}
    />
  );
}
