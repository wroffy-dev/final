'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { initials } from '@/lib/utils/format';
import {
  updateMyProfile,
  changeMyEmail,
  updateMyAvatar,
  removeMyAvatar,
} from '@/lib/actions/profile';
import type { ProfileData } from '@/lib/services/profile';

/**
 * Name, contact details and photo.
 *
 * Role, permissions and account status are shown read-only: they are somebody
 * else's decision, and the server actions behind this form cannot write them
 * even if the markup were tampered with.
 */
export function ProfileTab({
  data,
  maxUploadLabel,
}: {
  data: ProfileData;
  /** The configured upload ceiling, resolved on the server. */
  maxUploadLabel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = React.useState({
    name: data.profile.name,
    phone: data.profile.phone,
    jobTitle: data.profile.jobTitle,
    department: data.profile.department,
    timezone: data.profile.timezone,
  });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState(false);

  const [email, setEmail] = React.useState(data.profile.email);
  const [emailPassword, setEmailPassword] = React.useState('');
  const [emailErrors, setEmailErrors] = React.useState<Record<string, string[]>>({});
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [savingEmail, setSavingEmail] = React.useState(false);

  const [photoPending, setPhotoPending] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setErrors({});
    const result = await updateMyProfile(form);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Profile updated.');
    router.refresh();
  }

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    setSavingEmail(true);
    setEmailErrors({});
    setEmailError(null);

    const result = await changeMyEmail({ email, currentPassword: emailPassword });
    setSavingEmail(false);

    if (!result.ok) {
      setEmailErrors(result.fieldErrors ?? {});
      setEmailError(result.error);
      return;
    }
    setEmailPassword('');
    toast(result.message ?? 'Email updated.');
    router.refresh();
  }

  async function uploadPhoto(file: File) {
    setPhotoPending(true);
    const body = new FormData();
    body.append('file', file);
    const result = await updateMyAvatar(body);
    setPhotoPending(false);

    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Photo updated.');
    router.refresh();
  }

  async function dropPhoto() {
    setPhotoPending(true);
    const result = await removeMyAvatar();
    setPhotoPending(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Photo removed.');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Profile photo" description={`JPG, PNG or WEBP, up to ${maxUploadLabel}.`} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-4">
            {data.profile.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage URL, may be any host
              <img
                src={data.profile.image}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-1 ring-hairline"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-lg font-semibold text-brand">
                {initials(data.profile.name)}
              </span>
            )}

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  event.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={photoPending}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {photoPending ? 'Working…' : 'Change photo'}
              </Button>
              {data.profile.image ? (
                <Button variant="ghost" size="sm" onClick={dropPhoto} disabled={photoPending}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove photo
                </Button>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your details" description="How you appear to the rest of the team." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="profile-name" required error={errors.name}>
            <Input
              id="profile-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              autoComplete="name"
            />
          </Field>

          <Field label="Phone" htmlFor="profile-phone" error={errors.phone}>
            <Input
              id="profile-phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              autoComplete="tel"
            />
          </Field>

          <Field label="Job title" htmlFor="profile-title" error={errors.jobTitle}>
            <Input
              id="profile-title"
              value={form.jobTitle}
              onChange={(event) => set('jobTitle', event.target.value)}
              autoComplete="organization-title"
            />
          </Field>

          <Field label="Department" htmlFor="profile-department" error={errors.department}>
            <Input
              id="profile-department"
              value={form.department}
              onChange={(event) => set('department', event.target.value)}
            />
          </Field>

          <Field
            label="Timezone"
            htmlFor="profile-timezone"
            hint="Used when showing dates and times to you."
            error={errors.timezone}
          >
            <Select
              id="profile-timezone"
              value={form.timezone}
              onChange={(event) => set('timezone', event.target.value)}
            >
              <option value="">Use the site default</option>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Role" hint="Only an administrator can change this.">
            <Input value={data.profile.roleName} readOnly disabled />
          </Field>
        </CardBody>
        <CardFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader
          title="Sign-in email"
          description="This is the address you sign in with, so changing it needs your password."
        />
        <form onSubmit={saveEmail}>
          <CardBody className="space-y-4">
            {emailError ? (
              <Alert tone="danger">{emailError}</Alert>
            ) : null}

            <Field label="Email address" htmlFor="profile-email" required error={emailErrors.email}>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </Field>

            <Field
              label="Current password"
              htmlFor="profile-email-password"
              required
              hint="Other devices are signed out when the address changes."
            >
              <Input
                id="profile-email-password"
                type="password"
                value={emailPassword}
                onChange={(event) => setEmailPassword(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
          </CardBody>
          <CardFooter>
            <Button
              type="submit"
              variant="outline"
              disabled={savingEmail || !emailPassword || email === data.profile.email}
            >
              {savingEmail ? 'Updating…' : 'Update email'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

/**
 * A short list rather than the full IANA database: these cover where the team
 * actually works, and the server accepts any zone Intl recognises for anyone
 * who needs something else.
 */
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];
