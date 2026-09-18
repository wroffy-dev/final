'use server';

import { createCaptchaChallenge, type CaptchaChallenge } from '@/lib/forms/captcha';
import { getPublicForm } from '@/lib/services/forms';

/**
 * Hands the browser a fresh question and its signed token.
 *
 * The runtime calls this on mount, and again whenever a challenge expires, so
 * the token is never baked into cached page HTML. It returns null when the
 * named form does not exist or does not use a CAPTCHA, which keeps a caller
 * from putting a pointless question in front of a visitor.
 *
 * Public by design, like fetchPublicForm: a challenge discloses nothing — no
 * secret, no stored data, no answer — and the submission it guards is still
 * rate-limited. Handing one out is cheap and reveals only that the form asks
 * a question, which the visitor can see anyway.
 */
export async function requestCaptchaChallenge(formSlug: string): Promise<CaptchaChallenge | null> {
  if (typeof formSlug !== 'string' || formSlug.length > 120) return null;
  const form = await getPublicForm(formSlug);
  if (!form?.requireCaptcha) return null;
  return createCaptchaChallenge();
}
