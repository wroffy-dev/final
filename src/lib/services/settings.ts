import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type {
  EmailSettings,
  SeoSettings,
  TrackingSettings,
  WebsiteSettings,
} from '@prisma/client';

const SINGLETON = 'singleton';

/**
 * Settings singletons. `cache()` dedupes reads within one request; each mutation
 * revalidates the affected layout paths.
 */
export const getWebsiteSettings = cache(async (): Promise<WebsiteSettings> => {
  return prisma.websiteSettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
});

export const getSeoSettings = cache(async (): Promise<SeoSettings> => {
  return prisma.seoSettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
});

export const getTrackingSettings = cache(async (): Promise<TrackingSettings> => {
  return prisma.trackingSettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
});

/**
 * Raw email settings including the encrypted password.
 * Never return this from a Server Action — use `getEmailSettingsSafe`.
 */
export const getEmailSettings = cache(async (): Promise<EmailSettings> => {
  return prisma.emailSettings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
});

export type SafeEmailSettings = Omit<EmailSettings, 'password'> & { hasPassword: boolean };

/** Client-safe projection — the SMTP password never crosses the boundary. */
export async function getEmailSettingsSafe(): Promise<SafeEmailSettings> {
  const settings = await getEmailSettings();
  const { password, ...rest } = settings;
  return { ...rest, hasPassword: Boolean(password) };
}

export const SETTINGS_SINGLETON_ID = SINGLETON;
