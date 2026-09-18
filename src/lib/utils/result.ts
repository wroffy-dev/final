/** Uniform Server Action return type consumed by the admin forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function success<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function failure(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

import { z } from 'zod';
import { AuthorizationError } from '@/lib/auth/guards';

/** Maps thrown errors to a safe, user-facing ActionResult. Never leaks stacks. */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_form';
      (fieldErrors[path] ??= []).push(issue.message);
    }
    return failure('Please correct the highlighted fields.', fieldErrors);
  }
  if (error instanceof AuthorizationError) {
    return failure('You do not have permission to perform this action.');
  }
  if (error instanceof Error) {
    // Prisma unique-constraint violations are actionable for the user.
    if (error.message.includes('Unique constraint')) {
      return failure('That value is already in use. Please choose another.');
    }
    if (process.env.NODE_ENV !== 'production') return failure(error.message);
  }
  console.error('[action]', error);
  return failure('Something went wrong. Please try again.');
}
