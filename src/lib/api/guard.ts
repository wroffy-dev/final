import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUser, userCan, type SessionUser } from '@/lib/auth/guards';
import type { PermissionKey } from '@/lib/auth/permissions';

/**
 * Route-handler equivalent of `authorize()`.
 *
 * Pages redirect and Server Actions throw; a JSON route has to answer with a
 * status code instead, and must distinguish "not signed in" (401) from "signed
 * in but not allowed" (403) so the admin UI can react to each correctly.
 */
export type GuardResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function apiAuthorize(permission: PermissionKey): Promise<GuardResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }),
    };
  }

  if (!userCan(user, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You do not have permission to perform this action.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user };
}

/** JSON body with a uniform shape, never cached. */
export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
