import { describe, it, expect } from 'vitest';
import { submissionEnvelopeSchema } from '@/lib/validation/form-submission';
import {
  BUILT_IN_NOTICE_VERSION,
  CONSENT_MESSAGES,
  DEFAULT_CONSENT_NOTICE,
  buildCombinedLabel,
  buildConsentEvidence,
  consentSubmissionSchema,
  hasMarketingWording,
  interpretConsent,
  marketingConflict,
  marketingDisplayState,
  showsCheckbox,
  validateConsent,
  type ConsentRequirement,
} from '@/lib/privacy/consent';

/**
 * The consent object inside a submission, and the one box that produces it.
 *
 * It travels inside the envelope, so anything that makes it fail to parse makes
 * the *envelope* fail — and the visitor is told the submission "could not be
 * read", about a form they filled in correctly, with nothing they can change.
 * That is exactly what happened: `getCurrentNotice` returns version 0 for a
 * site with no notice published in the CMS, the page sent that 0 straight back,
 * and the schema required 1 or more. Every public form on such a site was
 * unsubmittable.
 *
 * So these tests pin three things: the consent object can never sink the
 * envelope, it can never report more consent than was actually given, and a
 * purpose that was not displayed is never recorded as agreed.
 */

function requirement(over: Partial<ConsentRequirement> = {}): ConsentRequirement {
  const base = {
    applies: true,
    lawfulBasis: 'CONSENT' as const,
    requireCheckbox: true,
    presentsEnquiry: true,
    presentsMarketing: false,
    presentsTerms: false,
    noticeKey: 'default',
    noticeVersion: BUILT_IN_NOTICE_VERSION,
    noticeSource: 'BUILT_IN' as const,
    noticeId: null,
    noticeScope: null,
    notice: DEFAULT_CONSENT_NOTICE,
    ...over,
  };
  return { ...base, combinedLabel: over.combinedLabel ?? buildCombinedLabel(base) };
}

function envelope(consent: unknown) {
  return submissionEnvelopeSchema.safeParse({
    formSlug: 'contact',
    values: { name: 'Himanshu Verma', email: 'himanshu@example.com' },
    consent,
  });
}

describe('consent inside the submission envelope', () => {
  it('accepts version 0, the notice built into the site', () => {
    const parsed = envelope({
      noticeKey: 'default',
      noticeVersion: BUILT_IN_NOTICE_VERSION,
      accepted: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.consent).toMatchObject({ noticeVersion: 0, accepted: true });
  });

  it('accepts a version published in the CMS', () => {
    const parsed = envelope({ noticeKey: 'default', noticeVersion: 3, accepted: true });
    expect(parsed.success && parsed.data.consent?.noticeVersion).toBe(3);
  });

  it('never fails the envelope over an unreadable version', () => {
    for (const noticeVersion of ['banana', -1, 2.5, {}, []]) {
      const parsed = envelope({ noticeVersion, accepted: true });
      expect(parsed.success, `version ${JSON.stringify(noticeVersion)}`).toBe(true);
    }
  });

  it('never fails the envelope over an unreadable notice key', () => {
    const parsed = envelope({ noticeKey: 42, accepted: true });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.consent?.noticeKey).toBeUndefined();
  });

  it('leaves the envelope valid when no consent object is sent at all', () => {
    const parsed = submissionEnvelopeSchema.safeParse({
      formSlug: 'contact',
      values: { name: 'Himanshu Verma' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.consent).toBeUndefined();
  });
});

describe('a box is ticked only when it was ticked', () => {
  it('does not read the string "false" as agreement', () => {
    expect(consentSubmissionSchema.parse({ accepted: 'false' }).accepted).toBe(false);
  });

  it('accepts the tokens a checkbox actually posts', () => {
    for (const value of [true, 'true', 'on', '1', 'yes']) {
      expect(consentSubmissionSchema.parse({ accepted: value }).accepted, String(value)).toBe(true);
    }
  });

  it('treats anything unrecognised as unticked', () => {
    for (const value of [0, '', 'maybe', {}, []]) {
      expect(consentSubmissionSchema.parse({ accepted: value }).accepted).toBe(false);
    }
  });

  it('keeps "not sent" apart from "sent unticked"', () => {
    expect(consentSubmissionSchema.parse({}).accepted).toBeUndefined();
    expect(consentSubmissionSchema.parse({ accepted: false }).accepted).toBe(false);
  });
});

describe('the required tick box is still enforced', () => {
  it('rejects a submission with the box unticked', () => {
    const verdict = validateConsent(requirement(), consentSubmissionSchema.parse({ accepted: false }));
    expect(verdict).toMatchObject({ ok: false, field: 'consent', message: CONSENT_MESSAGES.combined });
  });

  it('rejects a submission that sends no consent object at all', () => {
    expect(validateConsent(requirement(), undefined)).toMatchObject({ ok: false, field: 'consent' });
  });

  it('accepts a ticked box against the version being served', () => {
    const verdict = validateConsent(
      requirement(),
      consentSubmissionSchema.parse({ noticeVersion: BUILT_IN_NOTICE_VERSION, accepted: true }),
    );
    expect(verdict.ok).toBe(true);
  });

  it('asks the visitor to read again when the notice moved on under them', () => {
    const verdict = validateConsent(
      requirement({ noticeVersion: 2, noticeSource: 'PUBLISHED' }),
      consentSubmissionSchema.parse({ noticeVersion: 1, accepted: true }),
    );
    expect(verdict).toMatchObject({ ok: false, field: 'notice', message: CONSENT_MESSAGES.stale });
  });

  it('requires the box when Terms acceptance is what the form asks for', () => {
    const terms = requirement({
      lawfulBasis: 'LEGITIMATE_INTEREST',
      presentsEnquiry: false,
      presentsTerms: true,
      requireCheckbox: true,
    });
    expect(validateConsent(terms, consentSubmissionSchema.parse({ accepted: false }))).toMatchObject({
      ok: false,
      field: 'consent',
    });
    expect(validateConsent(terms, consentSubmissionSchema.parse({ accepted: true })).ok).toBe(true);
  });

  it('asks nothing of a form that collects nothing personal', () => {
    expect(validateConsent(requirement({ applies: false }), undefined).ok).toBe(true);
  });
});

describe('an optional box can be left unticked', () => {
  const optional = requirement({
    lawfulBasis: 'LEGITIMATE_INTEREST',
    requireCheckbox: false,
    presentsEnquiry: false,
    presentsMarketing: true,
  });

  it('submits without subscribing the visitor to anything', () => {
    const answer = consentSubmissionSchema.parse({ accepted: false });
    expect(validateConsent(optional, answer).ok).toBe(true);
    expect(buildConsentEvidence(optional, answer).marketingConsent).toBe(false);
  });

  it('records marketing when the visitor does tick it', () => {
    const evidence = buildConsentEvidence(optional, consentSubmissionSchema.parse({ accepted: true }));
    expect(evidence.marketingConsent).toBe(true);
    expect(evidence.marketingPresented).toBe(true);
  });
});

describe('only what was displayed is ever recorded', () => {
  it('records nothing for a purpose the block did not show', () => {
    const enquiryOnly = requirement({ presentsMarketing: false, presentsTerms: false });
    const evidence = buildConsentEvidence(
      enquiryOnly,
      consentSubmissionSchema.parse({ accepted: true }),
    );
    expect(evidence.enquiryConsent).toBe(true);
    expect(evidence.marketingConsent).toBe(false);
    expect(evidence.marketingPresented).toBe(false);
    expect(evidence.termsAccepted).toBe(false);
    expect(evidence.termsRequired).toBe(false);
  });

  it('never records marketing from a payload that simply claims it', () => {
    const hidden = requirement({ presentsMarketing: false });
    const crafted = consentSubmissionSchema.parse({ accepted: true, marketing: true });
    expect(buildConsentEvidence(hidden, crafted).marketingConsent).toBe(false);
  });

  it('never records Terms acceptance when Terms were not presented', () => {
    const noTerms = requirement({ presentsTerms: false });
    const crafted = consentSubmissionSchema.parse({ accepted: true, terms: true });
    expect(buildConsentEvidence(noTerms, crafted).termsAccepted).toBe(false);
  });

  it('keeps the exact wording that was on screen', () => {
    const full = requirement({
      presentsTerms: true,
      combinedLabel: 'I agree to the lot.',
      noticeVersion: 4,
      noticeSource: 'PUBLISHED',
      noticeScope: 'AE',
    });
    const evidence = buildConsentEvidence(full, consentSubmissionSchema.parse({ accepted: true }));

    expect(evidence.displayedLabel).toBe('I agree to the lot.');
    expect(evidence.noticeVersion).toBe(4);
    expect(evidence.noticeScope).toBe('AE');
    expect(evidence.purposeText).toBe(DEFAULT_CONSENT_NOTICE.purposeText);

    const displayed = (evidence.noticeSnapshot as { displayed: Record<string, unknown> }).displayed;
    expect(displayed.combinedLabel).toBe('I agree to the lot.');
    expect(displayed.enquiry).toBe(DEFAULT_CONSENT_NOTICE.enquiryLabel);
    expect(displayed.terms).toBe(DEFAULT_CONSENT_NOTICE.termsLabel);
    // Not shown, so not snapshotted as though it had been.
    expect(displayed.marketing).toBeNull();
  });

  it('records the notice the server is serving, not the version the page claimed', () => {
    const evidence = buildConsentEvidence(
      requirement({ noticeVersion: 4, noticeSource: 'PUBLISHED' }),
      consentSubmissionSchema.parse({ noticeVersion: 1, accepted: true }),
    );
    expect(evidence.noticeVersion).toBe(4);
  });
});

describe('a page rendered before the combined box still works', () => {
  it('reads its three separate boxes as themselves', () => {
    const both = requirement({
      lawfulBasis: 'LEGITIMATE_INTEREST',
      requireCheckbox: false,
      presentsEnquiry: false,
      presentsMarketing: true,
    });
    const legacy = consentSubmissionSchema.parse({ enquiry: true, marketing: false, terms: false });
    expect(interpretConsent(both, legacy).marketing).toBe(false);

    const wantsMarketing = consentSubmissionSchema.parse({ enquiry: true, marketing: true });
    expect(interpretConsent(both, wantsMarketing).marketing).toBe(true);
  });

  it('accepts a legacy page that ticked the required enquiry box', () => {
    const legacy = consentSubmissionSchema.parse({
      noticeVersion: BUILT_IN_NOTICE_VERSION,
      enquiry: true,
    });
    expect(validateConsent(requirement(), legacy).ok).toBe(true);
  });

  it('still refuses a legacy page that did not', () => {
    const legacy = consentSubmissionSchema.parse({ enquiry: false, marketing: true });
    expect(validateConsent(requirement(), legacy)).toMatchObject({ ok: false, field: 'consent' });
  });
});

describe('marketing wording may be empty', () => {
  it('treats empty and whitespace-only wording as nothing to show', () => {
    expect(hasMarketingWording('')).toBe(false);
    expect(hasMarketingWording('   \n\t ')).toBe(false);
    expect(hasMarketingWording(null)).toBe(false);
    expect(hasMarketingWording('Send me news')).toBe(true);
  });
});

describe('marketing can never be made mandatory', () => {
  it('refuses marketing on a form whose box is required by consent', () => {
    expect(
      marketingConflict({
        collectsPersonalData: true,
        lawfulBasis: 'CONSENT',
        requireTermsAcceptance: false,
        offerMarketingConsent: true,
      }),
    ).toMatch(/lawful basis is Consent/);
  });

  it('refuses marketing on a form whose box is required by Terms', () => {
    expect(
      marketingConflict({
        collectsPersonalData: true,
        lawfulBasis: 'LEGITIMATE_INTEREST',
        requireTermsAcceptance: true,
        offerMarketingConsent: true,
      }),
    ).toMatch(/Terms & Conditions acceptance/);
  });

  it('allows marketing on a form whose box is optional', () => {
    expect(
      marketingConflict({
        collectsPersonalData: true,
        lawfulBasis: 'LEGITIMATE_INTEREST',
        requireTermsAcceptance: false,
        offerMarketingConsent: true,
      }),
    ).toBeNull();
  });

  it('has nothing to say about a form that does not offer marketing', () => {
    expect(
      marketingConflict({
        collectsPersonalData: true,
        lawfulBasis: 'CONSENT',
        requireTermsAcceptance: true,
        offerMarketingConsent: false,
      }),
    ).toBeNull();
  });
});

describe('the label beside the box', () => {
  it('names exactly the purposes the box covers', () => {
    expect(buildCombinedLabel({ presentsEnquiry: true, presentsMarketing: false, presentsTerms: false }))
      .toBe('I agree to my details being used to respond to this enquiry.');
    expect(buildCombinedLabel({ presentsEnquiry: true, presentsMarketing: false, presentsTerms: true }))
      .toBe('I agree to my details being used to respond to this enquiry and the Terms & Conditions.');
    expect(buildCombinedLabel({ presentsEnquiry: false, presentsMarketing: true, presentsTerms: false }))
      .toBe('I agree to receiving marketing emails.');
    expect(buildCombinedLabel({ presentsEnquiry: false, presentsMarketing: false, presentsTerms: false }))
      .toBe('');
  });

  it('shows no box at all when there is nothing to agree to', () => {
    expect(showsCheckbox(requirement({
      requireCheckbox: false,
      presentsEnquiry: false,
      presentsMarketing: false,
      presentsTerms: false,
    }))).toBe(false);
    expect(buildConsentEvidence(
      requirement({ requireCheckbox: false, presentsEnquiry: false }),
      consentSubmissionSchema.parse({ accepted: true }),
    ).displayedLabel).toBeNull();
  });
});

describe('historical evidence is read, never reinterpreted', () => {
  it('will not guess whether marketing was offered before it was recorded', () => {
    const old = { marketingConsent: false, marketingPresented: null, withdrawnAt: null };
    expect(marketingDisplayState(old)).toBe('NOT_RECORDED');
  });

  it('keeps an old agreed record agreed', () => {
    const old = { marketingConsent: true, marketingPresented: null, withdrawnAt: null };
    expect(marketingDisplayState(old)).toBe('AGREED');
  });

  it('separates "not offered" from "offered and declined"', () => {
    expect(marketingDisplayState({ marketingConsent: false, marketingPresented: false, withdrawnAt: null }))
      .toBe('NOT_OFFERED');
    expect(marketingDisplayState({ marketingConsent: false, marketingPresented: true, withdrawnAt: null }))
      .toBe('DECLINED');
  });

  it('reports a withdrawal ahead of whatever was originally agreed', () => {
    expect(marketingDisplayState({ marketingConsent: true, marketingPresented: true, withdrawnAt: new Date() }))
      .toBe('WITHDRAWN');
  });
});
