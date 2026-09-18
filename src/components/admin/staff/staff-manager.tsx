'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash, Users, ShieldCheck } from 'lucide-react';
import { deleteStaff, saveRole, deleteRole } from '@/lib/actions/staff';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Textarea, Checkbox } from '@/components/ui/field';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { Spinner } from '@/components/ui/icons';
import { formatRelative, initials } from '@/lib/utils/format';

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  roleName: string;
  roleSlug: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  assignedLeadCount: number;
};

export type RoleRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
};

export type PermissionGroup = {
  group: string;
  label: string;
  permissions: Array<{ key: string; label: string }>;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'danger',
};

export function StaffManager({
  staff,
  roles,
  permissionGroups,
  currentUserId,
  isSuperAdmin,
}: {
  staff: StaffRow[];
  roles: RoleRow[];
  permissionGroups: PermissionGroup[];
  currentUserId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { toast } = useToast();
  // The sidebar links straight to /admin/staff?tab=roles, so the tab lives in
  // the URL rather than in component state — the link, back button and a
  // bookmark all land on the same view.
  const tab = search.get('tab') === 'roles' ? 'roles' : 'staff';
  const selectTab = (next: string) => {
    const params = new URLSearchParams(search.toString());
    if (next === 'staff') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<StaffRow | null>(null);
  const [editingRole, setEditingRole] = React.useState<RoleRow | null>(null);
  const [confirmRoleDelete, setConfirmRoleDelete] = React.useState<RoleRow | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Done.');
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <AdminTabs
        tabs={[
          { id: 'staff', label: 'Staff', badge: staff.length },
          { id: 'roles', label: 'Roles & permissions', badge: roles.length },
        ]}
        active={tab}
        onChange={selectTab}
      />

      <TabPanel id="staff" active={tab}>
        <Card>
          <CardHeader
            title="Staff"
            description="Everyone who can sign in to the admin."
            actions={
              <ButtonLink href="/admin/staff/new" size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add staff
              </ButtonLink>
            }
          />

          {staff.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No staff accounts" />
          ) : (
            <TableWrap>
              <Table className="min-w-[44rem]">
                <caption className="sr-only">Staff accounts</caption>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th align="center">Leads</Th>
                    <Th>Status</Th>
                    <Th>Last signed in</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <Tr key={member.id}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
                            aria-hidden="true"
                          >
                            {initials(member.name)}
                          </span>
                          <span className="min-w-0">
                            <Link
                              href={`/admin/staff/${member.id}`}
                              className="block truncate font-medium text-content hover:text-brand"
                            >
                              {member.name}
                              {member.id === currentUserId ? (
                                <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>
                              ) : null}
                            </Link>
                            <span className="block truncate text-xs text-muted">
                              {member.email}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={member.roleSlug === 'super-admin' ? 'purple' : 'neutral'}>
                          {member.roleName}
                        </Badge>
                      </Td>
                      <Td align="center">
                        {member.assignedLeadCount > 0 ? (
                          <Link
                            href={`/admin/leads?assignedTo=${member.id}`}
                            className="text-sm font-medium text-brand hover:underline"
                          >
                            {member.assignedLeadCount}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted">0</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[member.status] ?? 'neutral'}>
                          {member.status.charAt(0) + member.status.slice(1).toLowerCase()}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-muted">
                        {member.lastLoginAt ? formatRelative(member.lastLoginAt) : 'Never'}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/staff/${member.id}`}
                            className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                            aria-label={`Edit ${member.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          {member.id !== currentUserId ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(member)}
                              aria-label={`Delete ${member.name}`}
                              className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </TabPanel>

      <TabPanel id="roles" active={tab}>
        <Card>
          <CardHeader
            title="Roles and permissions"
            description={
              isSuperAdmin
                ? 'Every action in the admin is checked against these on the server.'
                : 'Only a super admin can change roles.'
            }
            actions={
              isSuperAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditingRole({
                      id: '',
                      name: '',
                      slug: '',
                      description: '',
                      isSystem: false,
                      userCount: 0,
                      permissions: [],
                    })
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New role
                </Button>
              ) : null
            }
          />
          <CardBody>
            <ul className="space-y-2">
              {roles.map((role) => (
                <li
                  key={role.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline px-3 py-2.5"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content">
                      {role.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {role.slug === 'super-admin'
                        ? 'Every permission'
                        : `${role.permissions.length} permission(s)`}
                      {role.description ? ` · ${role.description}` : ''}
                    </span>
                  </span>
                  <Badge tone="neutral">{role.userCount} staff</Badge>
                  {role.isSystem ? <Badge tone="info">Built in</Badge> : null}
                  {isSuperAdmin && role.slug !== 'super-admin' ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingRole(role)}
                        aria-label={`Edit ${role.name}`}
                        className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!role.isSystem ? (
                        <button
                          type="button"
                          onClick={() => setConfirmRoleDelete(role)}
                          aria-label={`Delete ${role.name}`}
                          className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </TabPanel>

      <RoleDialog
        role={editingRole}
        permissionGroups={permissionGroups}
        onClose={() => setEditingRole(null)}
        onSaved={() => {
          setEditingRole(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await run(() => deleteStaff(confirmDelete.id));
          setConfirmDelete(null);
        }}
        title="Delete this staff account?"
        message={
          confirmDelete
            ? `${confirmDelete.name} will no longer be able to sign in. Their ${confirmDelete.assignedLeadCount} assigned lead(s) and their activity history are kept.`
            : ''
        }
        pending={pending}
      />

      <ConfirmDialog
        open={Boolean(confirmRoleDelete)}
        onClose={() => setConfirmRoleDelete(null)}
        onConfirm={async () => {
          if (confirmRoleDelete) await run(() => deleteRole(confirmRoleDelete.id));
          setConfirmRoleDelete(null);
        }}
        title="Delete this role?"
        message="Roles in use cannot be deleted — move those staff to another role first."
        pending={pending}
      />
    </div>
  );
}

function RoleDialog({
  role,
  permissionGroups,
  onClose,
  onSaved,
}: {
  role: RoleRow | null;
  permissionGroups: PermissionGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [values, setValues] = React.useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });

  React.useEffect(() => {
    if (role) {
      setValues({
        name: role.name,
        description: role.description ?? '',
        permissions: role.permissions,
      });
    }
  }, [role]);

  if (!role) return null;

  const toggle = (key: string) =>
    setValues((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((k) => k !== key)
        : [...current.permissions, key],
    }));

  const toggleGroup = (group: PermissionGroup) => {
    const keys = group.permissions.map((p) => p.key);
    const allSelected = keys.every((key) => values.permissions.includes(key));
    setValues((current) => ({
      ...current,
      permissions: allSelected
        ? current.permissions.filter((key) => !keys.includes(key))
        : Array.from(new Set([...current.permissions, ...keys])),
    }));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={role.id ? `Edit role: ${role.name}` : 'New role'}
      description="Permissions are enforced on the server for every action, not just hidden in the UI."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !values.name.trim()}
            onClick={async () => {
              setPending(true);
              const result = await saveRole(role.id || null, values);
              setPending(false);
              if (!result.ok) {
                toast(result.error, 'error');
                return;
              }
              toast(result.message ?? 'Role saved.');
              onSaved();
            }}
          >
            {pending ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save role'
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role name" htmlFor="role-name" required>
          <Input
            id="role-name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
          />
        </Field>
        <Field label="Description" htmlFor="role-description">
          <Textarea
            id="role-description"
            rows={2}
            value={values.description}
            onChange={(e) => setValues({ ...values, description: e.target.value })}
          />
        </Field>

        <div className="space-y-3">
          <p className="text-sm font-medium text-content">
            Permissions ({values.permissions.length} selected)
          </p>
          {permissionGroups.map((group) => (
            <fieldset key={group.group} className="rounded-lg border border-hairline p-3">
              <legend className="px-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="text-sm font-medium text-content hover:text-brand"
                >
                  {group.label}
                </button>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission.key}
                    id={`perm-${permission.key}`}
                    checked={values.permissions.includes(permission.key)}
                    onChange={() => toggle(permission.key)}
                    label={permission.label}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
