import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR, ensureSystemRoles } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { createStaff, updateStaff, deleteStaff, saveRole } = await import('@/lib/actions/staff');
const { saveTrackingSettings, saveTrackingScript, deleteTrackingScript } = await import(
  '@/lib/actions/marketing'
);
const { savePopup, saveLeadMagnet, deleteLeadMagnet } = await import('@/lib/actions/campaigns');
const { verifyPassword } = await import('@/lib/auth/password');

const suffix = uniqueSuffix();
const createdUsers: string[] = [];
const createdScripts: string[] = [];
const createdPopups: string[] = [];
const createdMagnets: string[] = [];
let salesRoleId = '';
let adminRoleId = '';
let superAdminRoleId = '';
let trackingBackup: Record<string, unknown> | null = null;

beforeAll(async () => {
  await ensureSystemRoles();
  const [sales, admin, superAdmin] = await Promise.all([
    prisma.userRole.findUniqueOrThrow({ where: { slug: 'sales' } }),
    prisma.userRole.findUniqueOrThrow({ where: { slug: 'admin' } }),
    prisma.userRole.findUniqueOrThrow({ where: { slug: 'super-admin' } }),
  ]);
  salesRoleId = sales.id;
  adminRoleId = admin.id;
  superAdminRoleId = superAdmin.id;

  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: {
      id: TEST_ACTOR.id,
      email: TEST_ACTOR.email,
      name: TEST_ACTOR.name,
      roleId: superAdmin.id,
    },
  });

  trackingBackup = await prisma.trackingSettings.findUnique({ where: { id: 'singleton' } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.trackingScript.deleteMany({ where: { id: { in: createdScripts } } });
  await prisma.popup.deleteMany({ where: { id: { in: createdPopups } } });
  await prisma.leadMagnet.deleteMany({ where: { id: { in: createdMagnets } } });
  await prisma.userRole.deleteMany({ where: { slug: `test-custom-role-${suffix}` } });
  if (trackingBackup) {
    await prisma.trackingSettings.update({ where: { id: 'singleton' }, data: trackingBackup });
  }
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.$disconnect();
});

describe('staff management', () => {
  let userId = '';

  it('creates a staff account with a hashed password', async () => {
    const result = await createStaff(
      formData({
        name: `Test Staff ${suffix}`,
        email: `staff+${suffix}@example.test`,
        roleId: salesRoleId,
        status: 'ACTIVE',
        password: 'CorrectHorse9',
      }),
    );
    expect(result.ok).toBe(true);
    userId = (result as { data: { id: string } }).data.id;
    createdUsers.push(userId);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toBe('CorrectHorse9');
    expect(await verifyPassword('CorrectHorse9', user.passwordHash!)).toBe(true);
  });

  it('rejects a password that does not meet the policy', async () => {
    const result = await createStaff(
      formData({
        name: 'Weak',
        email: `weak+${suffix}@example.test`,
        roleId: salesRoleId,
        password: 'short',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.password).toBeTruthy();
  });

  it('rejects a duplicate email address', async () => {
    const result = await createStaff(
      formData({
        name: 'Duplicate',
        email: `staff+${suffix}@example.test`,
        roleId: salesRoleId,
        password: 'CorrectHorse9',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.email).toBeTruthy();
  });

  it('refuses to let a staff member change their own role', async () => {
    const result = await updateStaff(
      TEST_ACTOR.id,
      formData({
        name: TEST_ACTOR.name,
        email: TEST_ACTOR.email,
        roleId: salesRoleId,
        status: 'ACTIVE',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/own role/i);
  });

  it('refuses to let a staff member suspend themselves', async () => {
    const result = await updateStaff(
      TEST_ACTOR.id,
      formData({
        name: TEST_ACTOR.name,
        email: TEST_ACTOR.email,
        roleId: superAdminRoleId,
        status: 'SUSPENDED',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/suspend your own/i);
  });

  it('refuses to delete your own account', async () => {
    const result = await deleteStaff(TEST_ACTOR.id);
    expect(result.ok).toBe(false);
  });

  it('soft-deletes a staff account and frees the email address', async () => {
    const result = await deleteStaff(userId);
    expect(result.ok).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletedAt).not.toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.email).not.toBe(`staff+${suffix}@example.test`);
  });

  it('stops an admin assigning a role at or above their own level', async () => {
    vi.resetModules();
    const { mockAuth: restrictedAuth } = await import('../helpers');
    restrictedAuth(['staff.manage'], 'admin');

    const restricted = await import('@/lib/actions/staff');
    const result = await restricted.createStaff(
      formData({
        name: 'Escalation attempt',
        email: `escalate+${suffix}@example.test`,
        roleId: superAdminRoleId,
        password: 'CorrectHorse9',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/at or above your own level/i);
    expect(
      await prisma.user.count({ where: { email: `escalate+${suffix}@example.test` } }),
    ).toBe(0);
  });

  it('lets a super admin create a custom role', async () => {
    vi.resetModules();
    const { mockAuth: superAuth } = await import('../helpers');
    superAuth(undefined, 'super-admin');

    const actions = await import('@/lib/actions/staff');
    const result = await actions.saveRole(null, {
      name: `Test custom role ${suffix}`,
      description: 'For the integration test',
      permissions: ['leads.view', 'leads.edit', 'not-a-real-permission'],
    });
    expect(result.ok).toBe(true);

    const roleId = (result as { data: { id: string } }).data.id;
    const role = await prisma.userRole.findUniqueOrThrow({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });

    // The unknown key is dropped rather than stored.
    expect(role.permissions.map((p) => p.permission.key).sort()).toEqual(['leads.edit', 'leads.view']);
    await prisma.userRole.delete({ where: { id: roleId } });
  });

  it('refuses to modify the super-admin role', async () => {
    vi.resetModules();
    const { mockAuth: superAuth } = await import('../helpers');
    superAuth(undefined, 'super-admin');

    const actions = await import('@/lib/actions/staff');
    const result = await actions.saveRole(superAdminRoleId, {
      name: 'Super Admin',
      permissions: ['leads.view'],
    });
    expect(result.ok).toBe(false);
  });
});

describe('marketing settings', () => {
  it('rejects a malformed Google Analytics ID', async () => {
    vi.resetModules();
    const { mockAuth: superAuth } = await import('../helpers');
    superAuth(undefined, 'super-admin');
    const actions = await import('@/lib/actions/marketing');

    const result = await actions.saveTrackingSettings(
      formData({ ga4Id: 'not-a-measurement-id', ga4Enabled: false }),
    );
    expect(result.ok).toBe(false);
  });

  it('refuses to enable a tag with no ID', async () => {
    const result = await saveTrackingSettings(formData({ ga4Id: '', ga4Enabled: true }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Google Analytics/);
  });

  it('accepts valid vendor IDs', async () => {
    const result = await saveTrackingSettings(
      formData({
        ga4Id: 'G-ABC1234567',
        ga4Enabled: true,
        gtmId: 'GTM-ABCD123',
        gtmEnabled: true,
        metaPixelId: '123456789012345',
        metaPixelEnabled: true,
        consentRequired: true,
        consentMessage: 'We use cookies.',
      }),
    );
    expect(result.ok).toBe(true);

    const settings = await prisma.trackingSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(settings.ga4Id).toBe('G-ABC1234567');
    expect(settings.consentRequired).toBe(true);
  });

  it('strips surrounding script tags from a custom script', async () => {
    const result = await saveTrackingScript(
      null,
      formData({
        name: `Test script ${suffix}`,
        placement: 'HEAD',
        environment: 'ALL',
        isActive: false,
        requiresConsent: true,
        code: '<script>window.testFlag = true;</script>',
      }),
    );
    expect(result.ok).toBe(true);
    const scriptId = (result as { data: { id: string } }).data.id;
    createdScripts.push(scriptId);

    const script = await prisma.trackingScript.findUniqueOrThrow({ where: { id: scriptId } });
    expect(script.code).toBe('window.testFlag = true;');
    expect(script.code).not.toContain('<script');
  });

  it('records the full script body in the audit log', async () => {
    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'TrackingScript', action: 'created' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry?.after)).toContain('window.testFlag');
  });

  it('deletes a custom script', async () => {
    const scriptId = createdScripts.pop();
    if (!scriptId) return;
    expect((await deleteTrackingScript(scriptId)).ok).toBe(true);
    expect(await prisma.trackingScript.findUnique({ where: { id: scriptId } })).toBeNull();
  });
});

describe('popups and lead magnets', () => {
  it('requires a form for a lead-form popup', async () => {
    const result = await savePopup(null, {
      name: `Bad popup ${suffix}`,
      type: 'LEAD_FORM',
      trigger: 'DELAY',
      delaySeconds: 5,
      scrollPercent: 50,
      device: 'ALL',
      frequencyDays: 7,
      urlPatterns: [],
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.formId).toBeTruthy();
  });

  it('rejects an end date before the start date', async () => {
    const result = await savePopup(null, {
      name: `Bad dates ${suffix}`,
      type: 'OFFER',
      trigger: 'DELAY',
      delaySeconds: 5,
      scrollPercent: 50,
      device: 'ALL',
      frequencyDays: 7,
      startsAt: '2026-06-01',
      endsAt: '2026-05-01',
      urlPatterns: [],
    });
    expect(result.ok).toBe(false);
  });

  it('creates a popup with page targeting', async () => {
    const result = await savePopup(null, {
      name: `Test popup ${suffix}`,
      type: 'OFFER',
      isActive: true,
      heading: 'Free migration',
      trigger: 'SCROLL',
      delaySeconds: 5,
      scrollPercent: 60,
      device: 'MOBILE',
      frequencyDays: 3,
      ctaLabel: 'Claim',
      ctaUrl: '/contact',
      urlPatterns: ['pricing', 'blog/*'],
    });
    expect(result.ok).toBe(true);
    const popupId = (result as { data: { id: string } }).data.id;
    createdPopups.push(popupId);

    const popup = await prisma.popup.findUniqueOrThrow({ where: { id: popupId } });
    expect(popup.scrollPercent).toBe(60);
    expect(popup.urlPatterns).toEqual(['pricing', 'blog/*']);
  });

  it('strips an unsafe popup CTA URL', async () => {
    const result = await savePopup(null, {
      name: `Unsafe popup ${suffix}`,
      type: 'OFFER',
      trigger: 'DELAY',
      delaySeconds: 5,
      scrollPercent: 50,
      device: 'ALL',
      frequencyDays: 7,
      ctaUrl: 'javascript:alert(1)',
      urlPatterns: [],
    });
    expect(result.ok).toBe(true);
    const popupId = (result as { data: { id: string } }).data.id;
    createdPopups.push(popupId);

    const popup = await prisma.popup.findUniqueOrThrow({ where: { id: popupId } });
    expect(popup.ctaUrl).toBeNull();
  });

  it('creates a lead magnet with a unique slug', async () => {
    const result = await saveLeadMagnet(null, {
      title: `Migration guide ${suffix}`,
      slug: '',
      kind: 'PDF',
      description: 'A checklist for moving to Dropbox.',
      isActive: true,
      ctaLabel: 'Download',
    });
    expect(result.ok).toBe(true);
    const magnetId = (result as { data: { id: string } }).data.id;
    createdMagnets.push(magnetId);

    const magnet = await prisma.leadMagnet.findUniqueOrThrow({ where: { id: magnetId } });
    expect(magnet.slug).toBe(`migration-guide-${suffix}`);
  });

  it('soft-deletes a lead magnet', async () => {
    const magnetId = createdMagnets[0];
    if (!magnetId) return;
    expect((await deleteLeadMagnet(magnetId)).ok).toBe(true);

    const magnet = await prisma.leadMagnet.findUniqueOrThrow({ where: { id: magnetId } });
    expect(magnet.deletedAt).not.toBeNull();
    expect(magnet.isActive).toBe(false);
  });
});
