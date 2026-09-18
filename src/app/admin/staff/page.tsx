import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { PERMISSIONS, PERMISSION_GROUP_LABELS } from '@/lib/auth/permissions';
import { AdminPageHeader } from '@/components/admin/page-header';
import {
  StaffManager,
  type StaffRow,
  type RoleRow,
  type PermissionGroup,
} from '@/components/admin/staff/staff-manager';

export const metadata: Metadata = { title: 'Staff & roles' };
export const dynamic = 'force-dynamic';

export default async function StaffAdmin() {
  const user = await requirePermission('staff.manage');

  const [staff, roles] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        roles: { select: { name: true, slug: true } },
        _count: { select: { assignedLeads: { where: { deletedAt: null } } } },
      },
    }),
    prisma.userRole.findMany({
      orderBy: { rank: 'asc' },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  const staffRows: StaffRow[] = staff.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    jobTitle: member.jobTitle,
    roleName: member.roles.name,
    roleSlug: member.roles.slug,
    status: member.status,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    assignedLeadCount: member._count.assignedLeads,
  }));

  const roleRows: RoleRow[] = roles.map((role) => ({
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: role.permissions.map((rp) => rp.permission.key),
  }));

  // Group the catalogue so the role editor reads as a checklist per area.
  const grouped = new Map<string, PermissionGroup>();
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    const existing = grouped.get(meta.group) ?? {
      group: meta.group,
      label: PERMISSION_GROUP_LABELS[meta.group] ?? meta.group,
      permissions: [],
    };
    existing.permissions.push({ key, label: meta.label });
    grouped.set(meta.group, existing);
  }

  return (
    <>
      <AdminPageHeader
        title="Staff & roles"
        description="Who can sign in, and exactly what each of them may do."
        crumbs={[{ label: 'Staff' }]}
      />
      <StaffManager
        staff={staffRows}
        roles={roleRows}
        permissionGroups={Array.from(grouped.values())}
        currentUserId={user.id}
        isSuperAdmin={user.role === 'super-admin'}
      />
    </>
  );
}
