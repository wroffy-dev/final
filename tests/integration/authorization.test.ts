import { describe, it, expect } from 'vitest';
import { mockAuth } from '../helpers';

/**
 * Check 15: a user without the right permission cannot sync content, cannot
 * see IP addresses, and cannot record a consent withdrawal.
 *
 * Authorization is asserted at the action, not in the page that renders the
 * button — a client-side check would still have shipped the data.
 *
 * The role is deliberately not super-admin: the helper short-circuits every
 * check for that role, so it could not fail here.
 */
mockAuth(['leads.view', 'leads.export', 'leads.edit'], 'sales');

const { syncCountryContent } = await import('@/lib/actions/country-sync');
const { recordConsentWithdrawal } = await import('@/lib/actions/leads');
const { saveConsentNotice } = await import('@/lib/actions/consent');

describe('the new actions are authorized on the server', () => {
  it('refuses a sync without settings.manage', async () => {
    const result = await syncCountryContent({ targetCountryId: 'anything', mode: 'ADD_MISSING' });
    expect(result.ok).toBe(false);
  });

  it('refuses a consent withdrawal without leads.manageConsent', async () => {
    const result = await recordConsentWithdrawal({ recordId: 'anything', scope: 'MARKETING' });
    expect(result.ok).toBe(false);
  });

  it('refuses publishing a consent notice without leads.manageConsent', async () => {
    const result = await saveConsentNotice({
      purposeText: 'x',
      enquiryLabel: 'x',
      marketingLabel: 'x',
      termsLabel: 'x',
      withdrawalText: 'x',
      privacyUrl: '/privacy',
      termsUrl: '/terms',
    });
    expect(result.ok).toBe(false);
  });

  it('does not grant IP access with leads.view alone', async () => {
    const { userCan, getCurrentUser } = await import('@/lib/auth/guards');
    const user = await getCurrentUser();
    const canSeeIp = userCan(user, 'leads.viewIp');
    expect(canSeeIp).toBe(false);
  });
});
