'use client';

import * as React from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';

/**
 * Shows a freshly generated set of recovery codes.
 *
 * Rendered exactly once, at the moment they are created. They are stored as
 * keyed hashes, so there is no screen anywhere that can show them again — the
 * copy below says so plainly rather than letting someone discover it later.
 */
export function RecoveryCodesPanel({
  codes,
  onDone,
  doneLabel = 'I have saved these codes',
}: {
  codes: string[];
  onDone?: () => void;
  doneLabel?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const asText = React.useMemo(
    () =>
      [
        'Recovery codes',
        'Each code can be used once if your authenticator app is unavailable.',
        '',
        ...codes,
        '',
        `Generated ${new Date().toLocaleString()}`,
      ].join('\n'),
    [codes],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([asText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Save these now">
        This is the only time these codes are shown. Each one works once, if you cannot reach
        Microsoft Authenticator. Keep them somewhere separate from your password.
      </Alert>

      <ul className="grid grid-cols-1 gap-1.5 rounded-lg border border-hairline bg-muted/[0.04] p-4 sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="font-mono text-sm tracking-wider text-content">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={copy} type="button">
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button variant="outline" onClick={download} type="button">
          <Download className="h-4 w-4" aria-hidden="true" />
          Download codes
        </Button>
      </div>

      {onDone ? (
        <div className="space-y-3 border-t border-hairline pt-4">
          <label className="flex items-start gap-2.5 text-sm text-content">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-hairline text-brand focus:ring-2 focus:ring-brand/30"
            />
            I have saved these recovery codes somewhere safe.
          </label>
          <Button onClick={onDone} disabled={!acknowledged} className="w-full sm:w-auto">
            {doneLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
