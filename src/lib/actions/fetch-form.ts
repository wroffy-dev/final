'use server';

import { getPublicForm, type PublicForm } from '@/lib/services/forms';
import { getRequestCountry } from '@/lib/country/request';

/**
 * Returns a published form's public shape. Only active, non-deleted forms are
 * exposed, and no internal fields (notification emails, lead defaults) are
 * included in PublicForm.
 *
 * The market comes from the request, never from the caller: a client cannot ask
 * for a form that belongs to a market it is not browsing.
 */
export async function fetchPublicForm(slug: string): Promise<PublicForm | null> {
  if (typeof slug !== 'string' || slug.length > 120) return null;
  const country = await getRequestCountry();
  return getPublicForm(slug, country.id);
}
