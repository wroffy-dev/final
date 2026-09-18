import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Maintenance mode.
 *
 * The flag already existed on WebsiteSettings but nothing enforced it; the
 * public layout now honours it, and a restore toggles it here so visitors see
 * a holding page instead of a half-restored site.
 *
 * Admins are deliberately unaffected — whoever is running the restore still
 * needs the admin panel to see how it went.
 */
export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await prisma.websiteSettings.upsert({
    where: { id: 'singleton' },
    update: { maintenanceMode: enabled },
    create: { id: 'singleton', maintenanceMode: enabled },
  });

  // The public layout reads this per request, but cached routes need nudging.
  try {
    revalidatePath('/', 'layout');
  } catch {
    // revalidatePath throws outside a request scope (e.g. the cron worker);
    // the next request picks the value up regardless.
  }
}

export async function isMaintenanceMode(): Promise<boolean> {
  const settings = await prisma.websiteSettings.findUnique({
    where: { id: 'singleton' },
    select: { maintenanceMode: true },
  });
  return settings?.maintenanceMode ?? false;
}
