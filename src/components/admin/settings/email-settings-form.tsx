'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, PlugZap, ChevronDown } from 'lucide-react';
import {
  saveEmailSettings,
  testSmtpConnection,
  sendTestEmail,
  saveEmailTemplate,
} from '@/lib/actions/settings';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export type EmailSettingsValues = {
  host: string;
  port: string;
  username: string;
  encryption: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  notifyOnNewLead: boolean;
  notifyOnAssignment: boolean;
  notifyOnSubmission: boolean;
  salesNotificationEmails: string;
  isEnabled: boolean;
  hasPassword: boolean;
};

export type TemplateRow = {
  key: string;
  name: string;
  subject: string;
  body: string;
  isActive: boolean;
};

/** Tokens each template may use, shown as a reference in the editor. */
const TEMPLATE_TOKENS: Record<string, string[]> = {
  new_lead: [
    'site_name', 'lead_name', 'lead_email', 'lead_phone', 'lead_company', 'lead_message',
    'lead_source', 'lead_status', 'product_name', 'product_suffix', 'utm_campaign',
    'landing_url', 'lead_url',
  ],
  lead_assigned: [
    'site_name', 'assignee_name', 'actor_name', 'lead_name', 'lead_email', 'lead_phone',
    'lead_status', 'lead_url',
  ],
  form_submission: ['site_name', 'form_name', 'landing_url', 'submission_table'],
  lead_confirmation: ['site_name', 'lead_name', 'product_suffix'],
};

export function EmailSettingsForm({
  initial,
  templates,
  canEdit,
}: {
  initial: EmailSettingsValues;
  templates: TemplateRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [password, setPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testAddress, setTestAddress] = React.useState('');

  const set = <K extends keyof EmailSettingsValues>(key: K, value: EmailSettingsValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'hasPassword') data.set(key, String(value));
    }
    // Only sent when the admin typed a new one.
    if (password) data.set('password', password);

    const result = await saveEmailSettings(data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    setPassword('');
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!values.isEnabled ? (
        <Alert tone="warning" title="Email is switched off">
          Lead notifications and confirmations are not being sent. Fill in the SMTP details below and turn
          email on.
        </Alert>
      ) : null}

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader title="SMTP server" description="Credentials are encrypted before they are stored." />
          <CardBody className="space-y-4">
            <fieldset disabled={!canEdit || pending} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Host" htmlFor="smtp-host" error={errors.host}>
                  <Input
                    id="smtp-host"
                    value={values.host}
                    placeholder="smtp.example.com"
                    onChange={(e) => set('host', e.target.value)}
                  />
                </Field>
                <Field label="Port" htmlFor="smtp-port" error={errors.port}>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={values.port}
                    onChange={(e) => set('port', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Username" htmlFor="smtp-user">
                  <Input
                    id="smtp-user"
                    value={values.username}
                    autoComplete="off"
                    onChange={(e) => set('username', e.target.value)}
                  />
                </Field>
                <Field
                  label="Password"
                  htmlFor="smtp-password"
                  hint={values.hasPassword ? 'A password is stored. Leave blank to keep it.' : undefined}
                >
                  <Input
                    id="smtp-password"
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    placeholder={values.hasPassword ? '••••••••' : ''}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Encryption" htmlFor="smtp-encryption">
                <Select
                  id="smtp-encryption"
                  value={values.encryption}
                  onChange={(e) => set('encryption', e.target.value)}
                >
                  <option value="tls">STARTTLS (usually port 587)</option>
                  <option value="ssl">SSL/TLS (usually port 465)</option>
                  <option value="none">None</option>
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From name" htmlFor="smtp-from-name" required error={errors.fromName}>
                  <Input
                    id="smtp-from-name"
                    value={values.fromName}
                    onChange={(e) => set('fromName', e.target.value)}
                  />
                </Field>
                <Field label="From address" htmlFor="smtp-from-email" error={errors.fromEmail}>
                  <Input
                    id="smtp-from-email"
                    type="email"
                    value={values.fromEmail}
                    onChange={(e) => set('fromEmail', e.target.value)}
                  />
                </Field>
                <Field
                  label="Reply-to"
                  htmlFor="smtp-reply-to"
                  hint="Lead notifications already reply to the lead's own address."
                >
                  <Input
                    id="smtp-reply-to"
                    type="email"
                    value={values.replyTo}
                    onChange={(e) => set('replyTo', e.target.value)}
                  />
                </Field>
              </div>

              <div className="rounded-lg border border-hairline p-4">
                <Switch
                  checked={values.isEnabled}
                  onChange={(next) => set('isEnabled', next)}
                  label="Send email using these settings"
                  hint="When off, nothing is sent — useful while you are still setting up."
                />
              </div>
            </fieldset>
          </CardBody>

          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
              <Button
                type="button"
                variant="outline"
                disabled={testing || pending || !values.host}
                onClick={async () => {
                  setTesting(true);
                  const result = await testSmtpConnection();
                  setTesting(false);
                  toast(
                    result.ok ? (result.message ?? 'Connected.') : result.error,
                    result.ok ? 'success' : 'error',
                  );
                }}
              >
                <PlugZap className="h-4 w-4" aria-hidden="true" />
                Test connection
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  'Save email settings'
                )}
              </Button>
            </div>
          ) : null}
        </Card>
      </form>

      <Card>
        <CardHeader title="Notifications" description="Who hears about new activity." />
        <CardBody className="space-y-4">
          <Field
            label="Sales notification addresses"
            htmlFor="sales-emails"
            hint="Comma separated. These receive every new lead."
          >
            <Input
              id="sales-emails"
              value={values.salesNotificationEmails}
              disabled={!canEdit}
              placeholder="sales@example.com, ops@example.com"
              onChange={(e) => set('salesNotificationEmails', e.target.value)}
            />
          </Field>

          <div className="space-y-3 rounded-lg border border-hairline p-4">
            <Switch
              checked={values.notifyOnNewLead}
              onChange={(next) => set('notifyOnNewLead', next)}
              label="Email sales when a lead is captured"
              disabled={!canEdit}
            />
            <Switch
              checked={values.notifyOnAssignment}
              onChange={(next) => set('notifyOnAssignment', next)}
              label="Email a staff member when a lead is assigned to them"
              disabled={!canEdit}
            />
            <Switch
              checked={values.notifyOnSubmission}
              onChange={(next) => set('notifyOnSubmission', next)}
              label="Email on every form submission"
              hint="Including forms that do not create a lead."
              disabled={!canEdit}
            />
          </div>

          <p className="text-xs text-muted">
            Save the SMTP form above to store these — they are part of the same record.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Send a test" description="Confirms the whole path end to end." />
        <CardBody>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={testAddress}
              placeholder="you@example.com"
              aria-label="Test recipient"
              onChange={(e) => setTestAddress(e.target.value)}
            />
            <Button
              disabled={testing || !testAddress.includes('@')}
              onClick={async () => {
                setTesting(true);
                const result = await sendTestEmail({ to: testAddress });
                setTesting(false);
                toast(
                  result.ok ? (result.message ?? 'Sent.') : result.error,
                  result.ok ? 'success' : 'error',
                );
              }}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send test
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Templates"
          description="Tokens in double braces are replaced when the email is sent."
        />
        <CardBody className="space-y-2">
          {templates.map((template) => (
            <TemplateEditor key={template.key} template={template} canEdit={canEdit} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function TemplateEditor({ template, canEdit }: { template: TemplateRow; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [values, setValues] = React.useState({
    subject: template.subject,
    body: template.body,
    isActive: template.isActive,
  });

  const tokens = TEMPLATE_TOKENS[template.key] ?? [];

  return (
    <div className="rounded-lg border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-content">{template.name}</span>
          <span className="block truncate text-xs text-muted">{values.subject}</span>
        </span>
        {!values.isActive ? <Badge tone="neutral">Disabled</Badge> : null}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-hairline p-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <Field label="Subject" htmlFor={`tpl-${template.key}-subject`}>
              <Input
                id={`tpl-${template.key}-subject`}
                value={values.subject}
                onChange={(e) => setValues({ ...values, subject: e.target.value })}
              />
            </Field>
            <Field label="Body (HTML)" htmlFor={`tpl-${template.key}-body`}>
              <Textarea
                id={`tpl-${template.key}-body`}
                rows={10}
                value={values.body}
                onChange={(e) => setValues({ ...values, body: e.target.value })}
                className="font-mono text-xs"
              />
            </Field>
            <div className="rounded-lg bg-muted/[0.05] p-3">
              <p className="text-xs font-medium text-content">Available tokens</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {tokens.map((token) => (
                  <code key={token} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted">
                    {`{{${token}}}`}
                  </code>
                ))}
              </p>
            </div>
            <div className="rounded-lg border border-hairline p-3">
              <Switch
                checked={values.isActive}
                onChange={(next) => setValues({ ...values, isActive: next })}
                label="Template is active"
                hint="When off, this particular email is not sent."
              />
            </div>
          </fieldset>

          {canEdit ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  const result = await saveEmailTemplate({ key: template.key, ...values });
                  setPending(false);
                  if (!result.ok) {
                    toast(result.error, 'error');
                    return;
                  }
                  toast(result.message ?? 'Template saved.');
                  router.refresh();
                }}
              >
                {pending ? 'Saving…' : 'Save template'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
