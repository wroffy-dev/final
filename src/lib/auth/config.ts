import type { NextAuthConfig } from 'next-auth';
import { LOGIN_PATH } from '@/lib/auth/routes';

/**
 * Edge-safe slice of the Auth.js configuration.
 * Contains no Prisma/bcrypt imports so it can run inside middleware.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: LOGIN_PATH, error: LOGIN_PATH },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? null;
        token.permissions = (user as { permissions?: string[] }).permissions ?? [];
        token.name = user.name;
        token.email = user.email;
        // The id of the AuthSession row that actually grants access. Nothing
        // about the second factor is stored in the token: whether this session
        // has cleared MFA is read from that row on every request, so a client
        // cannot assert it and a revoked session cannot keep working.
        token.sid = (user as { sid?: string }).sid ?? undefined;
      }
      // A session refresh may correct the displayed name after a profile edit.
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as { name?: string };
        // Only presentational fields are accepted from an update() call —
        // this payload comes from the client. Role and permissions are
        // re-read from the database by the server-side guards regardless of
        // what the token says, and `sid` is never writable from here.
        if (s.name) token.name = s.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? token.sub ?? '';
        session.user.role = (token.role as string | null) ?? null;
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.sessionId = (token.sid as string | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
