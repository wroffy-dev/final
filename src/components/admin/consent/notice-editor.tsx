'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { saveConsentNotice } from '@/lib/actions/consent';
import type { ConsentNoticeContent } from '@/lib/privacy/consent';

export type NoticeVersion = {
  id: string;
  version: number;
  isCurrent: boolean;
  countryName: string | null;
  createdAt: string;
};

/**
 * The consent notice editor.
 *
 * Saving publishes a new version rather than editing the current one, and the
 * screen says so — an administrator who expects "save" to mean "change what
 * everyone already agreed to" would otherwise be surprised by the version
 * list growing.
 */
export function NoticeEditor({
  noticeKey,
  initial,
  versions,
  countries,
  canEdit,
}: {
  noticeKey: string;
  initial: ConsentNoticeContent;
  versions: NoticeVersion[];
  countries: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [countryId, setCountryId] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const set = (key: keyof ConsentNoticeContent, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    const result = await saveConsentNotice({ ...values, key: noticeKey, countryId: countryId || null });
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Published.');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Alert tone="info" title="Saving publishes a new version">
        The wording people have already agreed to is never changed. Each save adds a version;
        submissions keep pointing at the one they were shown, which is what makes the record
        evidence rather than a description.
      </Alert>

      <Card>
        <CardHeader
          title="What the information is for"
          description="Shown above the tick boxes, and copied into every submission's record."
        />
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <Field
              label="Purpose"
              htmlFor="purposeText"
              hint="Be specific. A notice that does not say what the details are used for cannot support consent as a lawful basis, whatever the tick box says."
              error={errors.purposeText?.[0]}
            >
              <Textarea
                id="purposeText"
                rows={4}
                value={values.purposeText}
                onChange={(event) => set('purposeText', event.target.value)}
              />
            </Field>

            <Field
              label="How to withdraw"
              htmlFor="withdrawalText"
              hint="How someone asks what you hold, or tells you to stop. Shown under the tick boxes."
              error={errors.withdrawalText?.[0]}
            >
              <Textarea
                id="withdrawalText"
                rows={3}
                value={values.withdrawalText}
                onChange={(event) => set('withdrawalText', event.target.value)}
              />
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What the tick box covers"
          description="A form shows one tick box; these sentences are what it can cover. Each is recorded separately, and marketing is never a condition of submitting."
        />
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <Field
              label="Enquiry processing"
              htmlFor="enquiryLabel"
              hint="Shown on forms whose lawful basis is Consent, where the tick box is required."
              error={errors.enquiryLabel?.[0]}
            >
              <Textarea
                id="enquiryLabel"
                rows={2}
                value={values.enquiryLabel}
                onChange={(event) => set('enquiryLabel', event.target.value)}
              />
            </Field>
            <Field
              label="Marketing (optional — may be left empty)"
              htmlFor="marketingLabel"
              hint={
                values.marketingLabel.trim()
                  ? 'Clear this box to stop asking for marketing consent anywhere on the site. Marketing never blocks a submission, and only appears on forms whose tick box is optional.'
                  : 'Empty: no form will ask for marketing consent, and no marketing sentence is rendered. Write something here to start offering it.'
              }
              error={errors.marketingLabel?.[0]}
            >
              <Textarea
                id="marketingLabel"
                rows={2}
                value={values.marketingLabel}
                placeholder="Leave empty if this site does not send marketing"
                onChange={(event) => set('marketingLabel', event.target.value)}
              />
            </Field>
            <Field
              label="Terms acceptance"
              htmlFor="termsLabel"
              hint="Only shown on forms that ask for it."
              error={errors.termsLabel?.[0]}
            >
              <Textarea
                id="termsLabel"
                rows={2}
                value={values.termsLabel}
                onChange={(event) => set('termsLabel', event.target.value)}
              />
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Policy links"
          description="Rendered beside the tick boxes and stored with every submission. They open in a new tab so nobody loses a half-filled form to read them."
        />
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Privacy Policy URL" htmlFor="privacyUrl" error={errors.privacyUrl?.[0]}>
                <Input
                  id="privacyUrl"
                  value={values.privacyUrl}
                  onChange={(event) => set('privacyUrl', event.target.value)}
                  placeholder="/privacy"
                />
              </Field>
              <Field
                label="Version"
                htmlFor="privacyVersion"
                hint="Optional, e.g. 2026-01."
                error={errors.privacyVersion?.[0]}
              >
                <Input
                  id="privacyVersion"
                  value={values.privacyVersion ?? ''}
                  onChange={(event) => set('privacyVersion', event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Terms URL" htmlFor="termsUrl" error={errors.termsUrl?.[0]}>
                <Input
                  id="termsUrl"
                  value={values.termsUrl}
                  onChange={(event) => set('termsUrl', event.target.value)}
                  placeholder="/terms"
                />
              </Field>
              <Field label="Version" htmlFor="termsVersion" error={errors.termsVersion?.[0]}>
                <Input
                  id="termsVersion"
                  value={values.termsVersion ?? ''}
                  onChange={(event) => set('termsVersion', event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Applies to"
              htmlFor="noticeCountry"
              hint="A market-specific version is used in that market only; everywhere else falls back to the shared one."
            >
              <Select
                id="noticeCountry"
                value={countryId}
                onChange={(event) => setCountryId(event.target.value)}
              >
                <option value="">Every market</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>
        </CardBody>

        {canEdit ? (
          <div className="flex justify-end border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Publishing…
                </>
              ) : (
                'Publish new version'
              )}
            </Button>
          </div>
        ) : null}
      </Card>

      {versions.length > 0 ? (
        <Card>
          <CardHeader
            title="Versions"
            description="Every version stays readable, because submissions cite the one they were shown."
          />
          <CardBody>
            <ul className="divide-y divide-hairline text-sm">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                >
                  <span className="font-medium text-content">v{version.version}</span>
                  {version.isCurrent ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      Live
                    </span>
                  ) : null}
                  <span className="text-muted">{version.countryName ?? 'Every market'}</span>
                  <span className="ml-auto text-xs text-muted">
                    {new Date(version.createdAt).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </form>
  );
}
