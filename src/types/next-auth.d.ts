import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string | null;
      permissions: string[];
      /** AuthSession row id; the row, not the token, confers access. */
      sessionId: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string | null;
    permissions?: string[];
    sessionId?: string | null;
    /** Passed from authorize() into the JWT on sign-in. */
    sid?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    role?: string | null;
    permissions?: string[];
    sid?: string;
  }
}
