'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveCustomer } from '@/lib/actions/customers';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { CUSTOMER_STATUS_LABELS } from '@/lib/crm/constants';

export type CustomerFormValues = {
  id?: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  gstin: string;
  status: string;
  assignedToId: string;
};

export const EMPTY_CUSTOMER: CustomerFormValues = {
  name: '',
  company: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  gstin: '',
  status: 'PROSPECT',
  assignedToId: '',
};

export function CustomerForm({
  initial,
  staff,
  canEdit,
  mode,
}: {
  initial: CustomerFormValues;
  staff: Array<{ id: string; name: string }>;
  canEdit: boolean;
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [values, setValues] = React.useState(initial);

  const set = (key: keyof CustomerFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'id') data.set(key, value);
    }

    const result = await saveCustomer(initial.id ?? null, data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    if (mode === 'create' && result.data && 'id' in result.data) {
      router.push(`/admin/customers/${(result.data as { id: string }).id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name" htmlFor="cust-name" required error={errors.name}>
                <Input id="cust-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Company" htmlFor="cust-company">
                <Input
                  id="cust-company"
                  value={values.company}
                  onChange={(e) => set('company', e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="cust-email" required error={errors.email}>
                <Input
                  id="cust-email"
                  type="email"
                  value={values.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="cust-phone" error={errors.phone}>
                <Input id="cust-phone" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Website" htmlFor="cust-website">
                <Input
                  id="cust-website"
                  value={values.website}
                  onChange={(e) => set('website', e.target.value)}
                />
              </Field>
              <Field label="Tax reference / GSTIN" htmlFor="cust-gstin">
                <Input id="cust-gstin" value={values.gstin} onChange={(e) => set('gstin', e.target.value)} />
              </Field>
              <Field label="Status" htmlFor="cust-status">
                <Select id="cust-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
                  {Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Account manager" htmlFor="cust-owner">
                <Select
                  id="cust-owner"
                  value={values.assignedToId}
                  onChange={(e) => set('assignedToId', e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Address" htmlFor="cust-address">
              <Textarea
                id="cust-address"
                rows={3}
                value={values.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>
          </fieldset>
        </CardBody>

        {canEdit ? (
          <div className="flex justify-end gap-2 border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
            <Link
              href="/admin/customers"
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-content"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : mode === 'create' ? (
                'Create customer'
              ) : (
                'Save customer'
              )}
            </Button>
          </div>
        ) : null}
      </Card>
    </form>
  );
}
