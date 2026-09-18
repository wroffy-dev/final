'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorizeSelf } from '@/lib/auth/guards';
import { storage } from '@/lib/storage';
import { hashPassword, passwordIssues, verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/utils/rate-limit';
import { sanitizeText } from '@/lib/utils/sanitize';
import { recordSecurityEvent } from '@/lib/security/security-log';
import { revokeSession, revokeUserSessions } from '@/lib/auth/session.service';
import {
  validateUpload,
  buildStorageKey,
  readImageDimensions,
  maxUploadBytes,
  tooLargeError,
} from '@/lib/services/upload';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

/**
 * Self-service account management.
 *
 * Every action here takes its user id from the session and never from its
 * arguments, so there is no request a user could craft that would edit someone
 * else's account. Nothing here can change a role, a permission or an account
 * status: those stay in the staff workflows, which are permission-gated.
 */

const OPTIONAL_ERROR = 'Please correct the highlighted fields.';

/** Trims, and turns an empty string into null so the column stays clean. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? sanitizeText(value) : null));

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: optionalText(40),
  jobTitle: optionalText(120),
  department: optionalText(120),
  timezone: optionalText(64),
});

const personalSchema = z.object({
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(80),
  state: optionalText(80),
  country: optionalText(80),
  postalCode: optionalText(20),
  alternatePhone: optionalText(40),
  bio: optionalText(2000),
});

export async function updateMyProfile(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();
    const data = profileSchema.parse(input);

    if (data.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: data.timezone });
      } catch {
        return failure(OPTIONAL_ERROR, { timezone: ['That is not a recognised timezone.'] });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: sanitizeText(data.name),
        phone: data.phone,
        jobTitle: data.jobTitle,
        department: data.department,
        timezone: data.timezone,
      },
    });

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'PROFILE_UPDATED',
      summary: 'Updated profile details',
    });

    revalidatePath('/admin/profile');
    return success(undefined, 'Profile updated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateMyPersonalDetails(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();
    const data = personalSchema.parse(input);

    await prisma.user.update({ where: { id: user.id }, data });

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'PROFILE_UPDATED',
      summary: 'Updated personal details',
    });

    revalidatePath('/admin/profile');
    return success(undefined, 'Personal details saved.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Changing the sign-in address.
 *
 * The current password is mandatory: the email *is* the identity here, so
 * taking it over would be equivalent to taking over the account. Every other
 * session is signed out afterwards, because a session opened under the old
 * address should not survive the change.
 */
export async function changeMyEmail(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();

    const data = z
      .object({
        email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(180),
        currentPassword: z.string().min(1, 'Enter your current password.'),
      })
      .parse(input);

    if (!rateLimit(`profile:email:${user.id}`, 5, 900).ok) {
      return failure('Too many attempts. Please try again later.');
    }

    if (!(await passwordMatches(user.id, data.currentPassword))) {
      return failure('That password was not correct.');
    }

    if (data.email === user.email.toLowerCase()) {
      return success(undefined, 'That is already your email address.');
    }

    const taken = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id: user.id } },
      select: { id: true },
    });
    if (taken) return failure(OPTIONAL_ERROR, { email: ['That email is already in use.'] });

    await prisma.user.update({
      where: { id: user.id },
      data: { email: data.email, emailVerified: null },
    });

    const revoked = await revokeUserSessions(user.id, 'EMAIL_CHANGED', user.sessionId);

    await recordSecurityEvent({
      userId: user.id,
      userEmail: data.email,
      action: 'EMAIL_CHANGED',
      summary: `Sign-in email changed; ${revoked} other session(s) signed out`,
    });

    revalidatePath('/admin/profile');
    return success(undefined, 'Email address updated.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Password change.
 *
 * Every other session is revoked — the point of changing a password is usually
 * that somebody else may have had it. The session doing the change survives,
 * which is safe because it has just proved knowledge of the old password and
 * already cleared the second factor.
 */
export async function changeMyPassword(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();

    const data = z
      .object({
        currentPassword: z.string().min(1, 'Enter your current password.'),
        newPassword: z.string().min(1, 'Enter a new password.'),
        confirmPassword: z.string().min(1, 'Confirm your new password.'),
      })
      .parse(input);

    if (!rateLimit(`profile:password:${user.id}`, 5, 900).ok) {
      return failure('Too many attempts. Please try again later.');
    }

    if (!(await passwordMatches(user.id, data.currentPassword))) {
      return failure('That password was not correct.');
    }

    if (data.newPassword !== data.confirmPassword) {
      return failure(OPTIONAL_ERROR, { confirmPassword: ['The two passwords do not match.'] });
    }

    if (data.newPassword === data.currentPassword) {
      return failure(OPTIONAL_ERROR, {
        newPassword: ['Choose a password you have not used here before.'],
      });
    }

    const issues = passwordIssues(data.newPassword);
    if (issues.length > 0) {
      return failure(OPTIONAL_ERROR, { newPassword: [`Password ${issues.join(', ')}.`] });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.newPassword),
        passwordChangedAt: new Date(),
      },
    });

    const revoked = await revokeUserSessions(user.id, 'PASSWORD_CHANGED', user.sessionId);

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'PASSWORD_CHANGED',
      summary: `Password changed; ${revoked} other session(s) signed out`,
    });

    revalidatePath('/admin/profile');
    return success(undefined, 'Password changed. Other devices have been signed out.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Avatar upload.
 *
 * Goes through the same validation the media library uses — magic-byte sniffing
 * and the configured size ceiling — but needs no media permission, because a
 * user changing their own picture is not managing the media library.
 */
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function updateMyAvatar(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await authorizeSelf();

    const file = formData.get('file');
    if (!(file instanceof File)) return failure('No image was received.');
    if (!AVATAR_TYPES.has(file.type)) {
      return failure('Choose a JPG, PNG or WEBP image.');
    }
    if (file.size > maxUploadBytes()) return failure(tooLargeError());

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUpload(file.type, buffer, buffer.byteLength);
    if (!validation.ok) return failure(validation.error);
    // The declared type is not trusted: validateUpload sniffs the real bytes,
    // and a file that sniffs as something other than an image is rejected here
    // even if its Content-Type claimed otherwise.
    if (!AVATAR_TYPES.has(validation.mimeType)) {
      return failure('Choose a JPG, PNG or WEBP image.');
    }

    const key = buildStorageKey(file.name, validation.extension);
    const stored = await storage().put({ key, body: buffer, mimeType: validation.mimeType });
    const dimensions = readImageDimensions(buffer, validation.mimeType);

    const media = await prisma.media.create({
      data: {
        filename: sanitizeText(file.name).slice(0, 200) || 'avatar',
        storageKey: stored.key,
        url: stored.url,
        provider: stored.provider,
        mimeType: validation.mimeType,
        kind: validation.kind,
        size: buffer.byteLength,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        altText: `Profile photo for ${user.name}`,
        uploadedById: user.id,
      },
    });

    await prisma.user.update({ where: { id: user.id }, data: { image: media.url } });

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'PROFILE_UPDATED',
      summary: 'Updated profile photo',
    });

    revalidatePath('/admin/profile');
    return success({ url: media.url }, 'Photo updated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeMyAvatar(): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();
    // The Media row is left alone: it may be referenced elsewhere, and
    // deleting it here would be a media-library operation in disguise.
    await prisma.user.update({ where: { id: user.id }, data: { image: null } });

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'PROFILE_UPDATED',
      summary: 'Removed profile photo',
    });

    revalidatePath('/admin/profile');
    return success(undefined, 'Photo removed.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeMyOtherSessions(): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();
    const revoked = await revokeUserSessions(user.id, 'REVOKED_BY_USER', user.sessionId);

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'OTHER_SESSIONS_REVOKED',
      summary: `Signed out ${revoked} other session(s)`,
    });

    revalidatePath('/admin/profile');
    return success(undefined, `Signed out ${revoked} other device${revoked === 1 ? '' : 's'}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeMySession(sessionId: string): Promise<ActionResult> {
  try {
    const user = await authorizeSelf();
    if (sessionId === user.sessionId) {
      return failure('That is the device you are using. Sign out instead.');
    }

    // Scoped to this user inside revokeSession, so a guessed id from another
    // account does nothing.
    const done = await revokeSession(sessionId, user.id, 'REVOKED_BY_USER');
    if (!done) return failure('That session has already ended.');

    await recordSecurityEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'SESSION_REVOKED',
      summary: 'Signed out a device',
    });

    revalidatePath('/admin/profile');
    return success(undefined, 'Device signed out.');
  } catch (error) {
    return toActionError(error);
  }
}

async function passwordMatches(userId: string, plain: string): Promise<boolean> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!account?.passwordHash) return false;
  return verifyPassword(plain, account.passwordHash);
}
