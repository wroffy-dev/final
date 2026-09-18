'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const seoSettingsSchema = z.object({
  defaultTitle: z.string().trim().min(1, 'A default title is required').max(240),
  titleTemplate: z.string().trim().min(1).max(120),
  defaultDescription: z.string().trim().max(400),
  defaultOgImageUrl: optional(500),
  twitterHandle: optional(60),
  organizationName: z.string().trim().min(1).max(160),
  organizationLogoUrl: optional(500),
  organizationType: z.string().trim().max(60).default('Organization'),
  googleSiteVerification: optional(200),
  bingSiteVerification: optional(200),
  robotsTxtExtra: optional(2000),
  sitemapEnabled: z.coerce.boolean().default(true),
  noIndexSite: z.coerce.boolean().default(false),
});

export async function saveSeoSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('seo.manage');
    const input = seoSettingsSchema.parse({
      defaultTitle: formData.get('defaultTitle'),
      titleTemplate: formData.get('titleTemplate'),
      defaultDescription: formData.get('defaultDescription') ?? '',
      defaultOgImageUrl: formData.get('defaultOgImageUrl'),
      twitterHandle: formData.get('twitterHandle'),
      organizationName: formData.get('organizationName'),
      organizationLogoUrl: formData.get('organizationLogoUrl'),
      organizationType: formData.get('organizationType') || 'Organization',
      googleSiteVerification: formData.get('googleSiteVerification'),
      bingSiteVerification: formData.get('bingSiteVerification'),
      robotsTxtExtra: formData.get('robotsTxtExtra'),
      sitemapEnabled: formData.get('sitemapEnabled') === 'true',
      noIndexSite: formData.get('noIndexSite') === 'true',
    });

    if (!input.titleTemplate.includes('%s')) {
      return failure('The title template must contain %s — the page title goes there.', {
        titleTemplate: ['Include %s, for example "%s | Acme"'],
      });
    }

    await prisma.seoSettings.upsert({
      where: { id: 'singleton' },
      update: {
        ...input,
        defaultTitle: sanitizeText(input.defaultTitle),
        defaultDescription: sanitizeText(input.defaultDescription),
        organizationName: sanitizeText(input.organizationName),
      },
      create: {
        id: 'singleton',
        ...input,
        defaultTitle: sanitizeText(input.defaultTitle),
        defaultDescription: sanitizeText(input.defaultDescription),
        organizationName: sanitizeText(input.organizationName),
      },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'SeoSettings',
      summary: 'Updated global SEO settings',
    });

    // Metadata, robots and the sitemap all read these values.
    revalidatePath('/', 'layout');
    revalidatePath('/robots.txt');
    revalidatePath('/sitemap.xml');
    return success(undefined, 'SEO settings saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const redirectSchema = z.object({
  source: z
    .string()
    .trim()
    .min(1, 'Enter the old path')
    .max(500)
    .transform((v) => (v.startsWith('/') || /^https?:\/\//i.test(v) ? v : `/${v}`)),
  destination: z
    .string()
    .trim()
    .min(1, 'Enter the new path')
    .max(500)
    .transform((v) => (v.startsWith('/') || /^https?:\/\//i.test(v) ? v : `/${v}`)),
  type: z.enum(['PERMANENT', 'TEMPORARY']).default('PERMANENT'),
  isActive: z.coerce.boolean().default(true),
  note: optional(200),
});

const normalise = (value: string) => value.replace(/^\/+|\/+$/g, '').toLowerCase();

export async function saveRedirect(
  redirectId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('seo.manage');
    const input = redirectSchema.parse({
      source: formData.get('source'),
      destination: formData.get('destination'),
      type: formData.get('type') || 'PERMANENT',
      isActive: formData.get('isActive') !== 'false',
      note: formData.get('note'),
    });

    if (normalise(input.source) === normalise(input.destination)) {
      return failure('A redirect cannot point at itself.', {
        destination: ['Choose a different destination'],
      });
    }

    // Walk the existing chain to make sure this rule does not close a loop.
    const chain = await detectLoop(input.source, input.destination, redirectId);
    if (chain) {
      return failure(`That would create a redirect loop: ${chain}`, {
        destination: ['This destination redirects back to the source'],
      });
    }

    const clash = await prisma.redirect.findFirst({
      where: { source: input.source, ...(redirectId ? { id: { not: redirectId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      return failure('A redirect already exists for that path.', { source: ['This path is already used'] });
    }

    const redirect = redirectId
      ? await prisma.redirect.update({ where: { id: redirectId }, data: input })
      : await prisma.redirect.create({ data: input });

    await recordAudit({
      actor: user,
      action: redirectId ? 'updated' : 'created',
      entity: 'Redirect',
      entityId: redirect.id,
      summary: `${input.source} → ${input.destination}`,
    });

    revalidatePath('/admin/redirects');
    return success({ id: redirect.id }, 'Redirect saved.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Follows the destination through existing redirects. Returns the chain as a
 * string when it leads back to the source, otherwise null.
 */
async function detectLoop(
  source: string,
  destination: string,
  ignoreId: string | null,
): Promise<string | null> {
  const seen = new Set<string>([normalise(source)]);
  const chain = [source];
  let current = destination;

  for (let depth = 0; depth < 12; depth += 1) {
    chain.push(current);
    if (seen.has(normalise(current))) return chain.join(' → ');
    seen.add(normalise(current));

    if (/^https?:\/\//i.test(current)) return null;

    const next: { destination: string } | null = await prisma.redirect.findFirst({
      where: {
        isActive: true,
        source: current,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { destination: true },
    });
    if (!next) return null;
    current = next.destination;
  }

  return chain.join(' → ');
}

export async function toggleRedirect(redirectId: string): Promise<ActionResult> {
  try {
    await authorize('seo.manage');
    const redirect = await prisma.redirect.findUnique({ where: { id: redirectId } });
    if (!redirect) return failure('That redirect no longer exists.');

    await prisma.redirect.update({ where: { id: redirectId }, data: { isActive: !redirect.isActive } });
    revalidatePath('/admin/redirects');
    return success(undefined, redirect.isActive ? 'Redirect disabled.' : 'Redirect enabled.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRedirect(redirectId: string): Promise<ActionResult> {
  try {
    const user = await authorize('seo.manage');
    const redirect = await prisma.redirect.findUnique({ where: { id: redirectId } });
    if (!redirect) return failure('That redirect no longer exists.');

    await prisma.redirect.delete({ where: { id: redirectId } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Redirect',
      entityId: redirectId,
      summary: `Removed ${redirect.source} → ${redirect.destination}`,
    });

    revalidatePath('/admin/redirects');
    return success(undefined, 'Redirect deleted.');
  } catch (error) {
    return toActionError(error);
  }
}
