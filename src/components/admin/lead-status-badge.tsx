/**
 * Historic import path.
 *
 * Every status badge now lives in `status-badge.tsx` so the admin has one
 * vocabulary; these re-exports keep existing call sites working.
 */
export { LeadStatusBadge, ContentStatusBadge } from './status-badge';
