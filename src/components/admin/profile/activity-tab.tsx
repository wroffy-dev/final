import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import type { ProfileData } from '@/lib/services/profile';

/**
 * The account's own security history.
 *
 * Scoped server-side to this user's events, so it never becomes a window onto
 * anyone else's activity — including for a super admin, who has the full audit
 * log elsewhere for that.
 */

const LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  LOGIN_SUCCESS: { label: 'Signed in', tone: 'neutral' },
  LOGIN_FAILED: { label: 'Failed sign-in', tone: 'danger' },
  MFA_LOGIN_VERIFIED: { label: 'Two-step verified', tone: 'success' },
  MFA_VERIFICATION_FAILED: { label: 'Failed verification', tone: 'danger' },
  MFA_SETUP_STARTED: { label: 'Setup started', tone: 'info' },
  MFA_ENABLED: { label: 'Authenticator enabled', tone: 'success' },
  MFA_RESET_BY_USER: { label: 'Authenticator reset', tone: 'warning' },
  MFA_RESET_BY_ADMIN: { label: 'Reset by administrator', tone: 'warning' },
  RECOVERY_CODE_USED: { label: 'Recovery code used', tone: 'warning' },
  RECOVERY_CODES_REGENERATED: { label: 'New recovery codes', tone: 'info' },
  PASSWORD_CHANGED: { label: 'Password changed', tone: 'info' },
  EMAIL_CHANGED: { label: 'Email changed', tone: 'info' },
  PROFILE_UPDATED: { label: 'Profile updated', tone: 'neutral' },
  OTHER_SESSIONS_REVOKED: { label: 'Devices signed out', tone: 'info' },
  SESSION_REVOKED: { label: 'Device signed out', tone: 'info' },
};

export function ActivityTab({ data }: { data: ProfileData }) {
  const facts: Array<[string, string]> = [
    ['Account created', formatDate(data.profile.createdAt, true)],
    ['Last sign-in', formatDate(data.profile.lastLoginAt, true)],
    ['Password last changed', formatDate(data.profile.passwordChangedAt, true)],
    ['Authenticator enabled on', formatDate(data.mfa.configuredAt, true)],
    ['Last two-step verification', formatDate(data.mfa.lastVerifiedAt, true)],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Account" description="Key dates for this account." />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-0.5 text-sm text-content">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recent security activity"
          description="The last 25 security events on your account."
        />
        <CardBody>
          {data.events.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.events.map((event) => {
                const meta = LABELS[event.action] ?? {
                  label: event.action,
                  tone: 'neutral' as BadgeTone,
                };
                return (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-start gap-3 rounded-lg border border-hairline px-3.5 py-3"
                  >
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <div className="min-w-0 flex-1">
                      {event.summary ? (
                        <p className="text-sm text-content">{event.summary}</p>
                      ) : null}
                      <p className="text-xs text-muted">{formatDate(event.createdAt, true)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
