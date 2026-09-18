'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createStaff, updateStaff } from '@/lib/actions/staff';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';

export type StaffFormValues = {
  id?: string;
  name: string;
  email: string;
  jobTitle: string;
  phone: string;
  roleId: string;
  status: string;
};

export const EMPTY_STAFF: StaffFormValues = {
  name: '',
  email: '',
  jobTitle: '',
  phone: '',
  roleId: '',
  status: 'ACTIVE',
};

export function StaffForm({
  initial,
  roles,
  mode,
  isSelf,
}: {
  initial: StaffFormValues;
  roles: Array<{ id: string; name: string }>;
  mode: 'create' | 'edit';
  isSelf: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [password, setPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);

  const set = (key: keyof StaffFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'id') data.set(key, value);
    }
    if (password) data.set('password', password);

    const result = mode === 'create' ? await createStaff(data) : await updateStaff(initial.id!, data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    setPassword('');
    toast(result.message ?? 'Saved.');
    if (mode === 'create') router.push('/admin/staff');
    else router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {isSelf ? (
        <Alert tone="info" className="mb-5">
          This is your own account. You cannot change your own role or suspend yourself — ask another
          administrator.
        </Alert>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <fieldset disabled={pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="staff-name" required error={errors.name}>
                <Input id="staff-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Email address" htmlFor="staff-email" required error={errors.email}>
                <Input
                  id="staff-email"
                  type="email"
                  value={values.email}
                  autoComplete="off"
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Job title" htmlFor="staff-title">
                <Input
                  id="staff-title"
                  value={values.jobTitle}
                  onChange={(e) => set('jobTitle', e.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="staff-phone">
                <Input id="staff-phone" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field
                label="Role"
                htmlFor="staff-role"
                required
                error={errors.roleId}
                hint={isSelf ? 'You cannot change your own role.' : 'Decides what they can do.'}
              >
                <Select
                  id="staff-role"
                  value={values.roleId}
                  disabled={isSelf}
                  onChange={(e) => set('roleId', e.target.value)}
                >
                  <option value="">Choose a role…</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="staff-status" error={errors.status}>
                <Select
                  id="staff-status"
                  value={values.status}
                  disabled={isSelf}
                  onChange={(e) => set('status', e.target.value)}
                >
                  <option value="ACTIVE">Active — can sign in</option>
                  <option value="INVITED">Invited — cannot sign in yet</option>
                  <option value="SUSPENDED">Suspended — sign-in blocked</option>
                </Select>
              </Field>
            </div>

            <Field
              label={mode === 'create' ? 'Initial password' : 'Set a new password'}
              htmlFor="staff-password"
              required={mode === 'create'}
              error={errors.password}
              hint="At least 10 characters with upper case, lower case and a number. Leave blank to keep the current one."
            >
              <Input
                id="staff-password"
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </fieldset>
        </CardBody>

        <div className="flex justify-end gap-2 border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
          <Link
            href="/admin/staff"
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
              'Create account'
            ) : (
              'Save account'
            )}
          </Button>
        </div>
      </Card>
    </form>
  );
}
