'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { publishNotice } from '@/lib/services/consent';
import { consentNoticeSchema, CONSENT_NOTICE_KEY_DEFAULT } from '@/lib/privacy/consent';
import { sanitizeText } from '@/lib/utils/sanitize';
import { safeUrl } from '@/lib/utils/sanitize';
import { success, toActionError, failure, type ActionResult } from '@/lib/utils/result';

const saveSchema = z.object({
  key: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lower-case letters, numbers and hyphens.')
    .optional(),
  countryId: z.string().trim().max(40).optional().nullable(),
  ...consentNoticeSchema.shape,
});

/**
 * Publishes a new version of a consent notice.
 *
 * There is no "edit in place" on purpose. Submissions cite the version they
 * were shown, so changing a published version would silently rewrite what
 * people are recorded as having agreed to — the one thing the evidence exists
 * to prevent.
 */
export async function saveConsentNotice(input: unknown): Promise<ActionResult<{ version: number }>> {
  try {
    const user = await authorize('leads.manageConsent');
    const parsed = saveSchema.parse(input);

    /*
     * The policy links are put through the same guard as every other stored
     * URL, so a `javascript:` value can never reach the href of a link the
     * consent block renders. A relative path is kept as typed.
     */
    const privacyUrl = normaliseLink(parsed.privacyUrl);
    const termsUrl = normaliseLink(parsed.termsUrl);
    if (!privacyUrl || !termsUrl) {
      return failure('Enter a valid Privacy Policy and Terms URL.', {
        ...(privacyUrl ? {} : { privacyUrl: ['Enter a path such as /privacy, or a full URL.'] }),
        ...(termsUrl ? {} : { termsUrl: ['Enter a path such as /terms, or a full URL.'] }),
      });
    }

    const created = await publishNotice({
      key: parsed.key || CONSENT_NOTICE_KEY_DEFAULT,
      countryId: parsed.countryId || null,
      actorId: user.id,
      content: {
        purposeText: sanitizeText(parsed.purposeText),
        enquiryLabel: sanitizeText(parsed.enquiryLabel),
        /*
         * Cleared on purpose stays cleared. `sanitizeText` of an empty string
         * is an empty string, and nothing downstream substitutes the built-in
         * wording for a stored value — so a site that does not do email
         * marketing simply stops showing a marketing sentence, rather than
         * having one reinstated behind the administrator's back.
         */
        marketingLabel: parsed.marketingLabel ? sanitizeText(parsed.marketingLabel).trim() : '',
        termsLabel: sanitizeText(parsed.termsLabel),
        withdrawalText: sanitizeText(parsed.withdrawalText),
        privacyUrl,
        privacyVersion: parsed.privacyVersion ? sanitizeText(parsed.privacyVersion) : null,
        termsUrl,
        termsVersion: parsed.termsVersion ? sanitizeText(parsed.termsVersion) : null,
      },
    });

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'ConsentNotice',
      entityId: created.id,
      summary: `Published consent notice “${parsed.key || CONSENT_NOTICE_KEY_DEFAULT}” v${created.version}`,
    });

    /*
     * Every public page, not just this screen. A form's consent block is
     * rendered inside cached page output, so publishing wording that the admin
     * can see but visitors cannot would be worse than not publishing it: the
     * version the page still shows would no longer match the version the
     * server validates against, and every submission would be told the notice
     * had changed.
     */
    revalidatePath('/admin/consent');
    revalidatePath('/', 'layout');
    return success({ version: created.version }, `Published version ${created.version}.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * A relative path stays relative; anything else goes through `safeUrl`.
 *
 * Policy links are usually "/privacy" on the same site, and `safeUrl` is built
 * for absolute URLs — running a bare path through it would reject the common
 * case.
 */
function normaliseLink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return safeUrl(trimmed);
}
