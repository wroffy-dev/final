'use client';

import { signOut } from 'next-auth/react';
import { LOGIN_PATH } from '@/lib/auth/routes';

/** Escape hatch on the pre-session screens, where there is no account menu. */
export function SignOutLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: LOGIN_PATH })}
      className="font-medium text-brand underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}
