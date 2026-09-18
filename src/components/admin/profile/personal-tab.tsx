'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { updateMyPersonalDetails } from '@/lib/actions/profile';
import type { ProfileData } from '@/lib/services/profile';

/** Optional contact details. Nothing here affects access or permissions. */
export function PersonalTab({ data }: { data: ProfileData }) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = React.useState(data.personal);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setErrors({});
    const result = await updateMyPersonalDetails(form);
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Personal details"
        description="Optional. Visible only to you and to administrators."
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 1" htmlFor="pd-address1" error={errors.addressLine1} className="sm:col-span-2">
          <Input
            id="pd-address1"
            value={form.addressLine1}
            onChange={(event) => set('addressLine1', event.target.value)}
            autoComplete="address-line1"
          />
        </Field>

        <Field label="Address line 2" htmlFor="pd-address2" error={errors.addressLine2} className="sm:col-span-2">
          <Input
            id="pd-address2"
            value={form.addressLine2}
            onChange={(event) => set('addressLine2', event.target.value)}
            autoComplete="address-line2"
          />
        </Field>

        <Field label="City" htmlFor="pd-city" error={errors.city}>
          <Input
            id="pd-city"
            value={form.city}
            onChange={(event) => set('city', event.target.value)}
            autoComplete="address-level2"
          />
        </Field>

        <Field label="State or region" htmlFor="pd-state" error={errors.state}>
          <Input
            id="pd-state"
            value={form.state}
            onChange={(event) => set('state', event.target.value)}
            autoComplete="address-level1"
          />
        </Field>

        <Field label="Country" htmlFor="pd-country" error={errors.country}>
          <Input
            id="pd-country"
            value={form.country}
            onChange={(event) => set('country', event.target.value)}
            autoComplete="country-name"
          />
        </Field>

        <Field label="Postal code" htmlFor="pd-postal" error={errors.postalCode}>
          <Input
            id="pd-postal"
            value={form.postalCode}
            onChange={(event) => set('postalCode', event.target.value)}
            autoComplete="postal-code"
          />
        </Field>

        <Field label="Alternate phone" htmlFor="pd-alt-phone" error={errors.alternatePhone}>
          <Input
            id="pd-alt-phone"
            value={form.alternatePhone}
            onChange={(event) => set('alternatePhone', event.target.value)}
            autoComplete="tel"
          />
        </Field>

        <Field
          label="About"
          htmlFor="pd-bio"
          error={errors.bio}
          className="sm:col-span-2"
          hint="A short description of what you do."
        >
          <Textarea
            id="pd-bio"
            value={form.bio}
            rows={4}
            maxLength={2000}
            onChange={(event) => set('bio', event.target.value)}
          />
        </Field>
      </CardBody>
      <CardFooter>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </CardFooter>
    </Card>
  );
}
