/**
 * Where authentication lives in the URL space.
 *
 * The sign-in screen sits on a deliberately unconventional path rather than
 * `/login`. Every credential-stuffing bot on the internet knows the
 * conventional one, and the rate limiter in `src/lib/auth/index.ts` should not
 * be the first thing standing between the site and a scripted attack.
 *
 * This module is the single definition of that path. It imports nothing, so
 * middleware (edge runtime), the server-side guards and client components all
 * read the same value — moving the screen again means editing this one line
 * and renaming the matching directory under `src/app`.
 */
export const LOGIN_PATH = '/auth-control-panel/admin';

/**
 * The first path segment `LOGIN_PATH` occupies.
 *
 * Kept next to it so the reserved-segment list and the no-index header cannot
 * drift away from the path they are meant to cover.
 */
export const LOGIN_PATH_SEGMENT = 'auth-control-panel';
