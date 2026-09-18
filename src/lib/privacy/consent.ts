import { z } from 'zod';
import type { LawfulBasis } from '@prisma/client';

/**
 * The consent notice, as the form renders it and the evidence stores it.
 *
 * A public form shows **one** tick box. Behind it there are still three
 * separate permissions, because they are three separate questions and the CRM
 * has to be able to answer each of them:
 *
 *  - **enquiry** — may we process what you sent in order to answer it. Asked
 *    when the form's lawful basis is CONSENT.
 *  - **marketing** — may we also send you unrelated marketing. Always
 *    optional; nothing here can ever make it a condition of submitting.
 *  - **terms** — you accept the Terms & Conditions. Asked only by forms that
 *    need it, and recorded separately because accepting terms is not the same
 *    act as permitting data processing.
 *
 * One control, three records. Each recorded permission is derived from the box
 * being ticked **and** from that purpose actually appearing in the wording the
 * visitor was shown — so a purpose that was not on screen is never recorded as
 * agreed, whatever the box says.
 *
 * This is a set of controls that supports DPDP/GDPR requirements. It is not a
 * claim that a tick box makes a website compliant; see
 * docs/CONSENT-AND-PRIVACY.md for the decisions that still need a person.
 */

export const CONSENT_NOTICE_KEY_DEFAULT = 'default';

/**
 * The version number of the wording compiled into the application.
 *
 * Zero, and never used by a stored notice: `publishNotice` allocates from 1
 * upwards, so a version of 0 identifies the built-in fallback and nothing
 * else. It travels with the form, comes back with the submission, and is
 * recorded in the evidence exactly like a published version — the one thing it
 * must never be treated as is "missing".
 */
export const BUILT_IN_NOTICE_VERSION = 0;

/** Where a rendered notice came from. */
export type NoticeSource = 'BUILT_IN' | 'PUBLISHED';

/**
 * Marketing wording, which an administrator is allowed to leave empty.
 *
 * Empty means "this site does not ask for marketing consent", so whitespace
 * collapses to empty rather than to a line of spaces that would render as a
 * blank tick box with no wording beside it.
 */
export const marketingLabelSchema = z
  .string()
  .max(1000)
  .transform((value) => value.trim())
  .catch('');

/** Is there marketing wording to show? Whitespace does not count. */
export function hasMarketingWording(label: string | null | undefined): boolean {
  return typeof label === 'string' && label.trim().length > 0;
}

/** The shape of a notice, shared by the CMS editor and the renderer. */
export const consentNoticeSchema = z.object({
  purposeText: z.string().trim().min(1).max(2000),
  enquiryLabel: z.string().trim().min(1).max(1000),
  /**
   * Optional on purpose. A site that does not do email marketing has nothing
   * to say here, and forcing a sentence in would put a marketing tick box in
   * front of every visitor of a business that never sends any.
   */
  marketingLabel: marketingLabelSchema,
  termsLabel: z.string().trim().min(1).max(1000),
  withdrawalText: z.string().trim().min(1).max(1000),
  privacyUrl: z.string().trim().min(1).max(500),
  privacyVersion: z.string().trim().max(40).optional().nullable(),
  termsUrl: z.string().trim().min(1).max(500),
  termsVersion: z.string().trim().max(40).optional().nullable(),
});

export type ConsentNoticeContent = z.infer<typeof consentNoticeSchema>;

/**
 * The wording a site starts with.
 *
 * Deliberately specific about purpose rather than "we may contact you about
 * anything": a notice that does not say what the information is for cannot
 * support a consent-based lawful basis, whatever the tick box says. The
 * business is expected to review this text — see docs/CONSENT-AND-PRIVACY.md.
 *
 * This applies only while nothing has been published in the CMS. Once an
 * administrator saves a notice, the saved wording is used verbatim — including
 * an intentionally empty marketing line, which is a decision and not a gap.
 */
export const DEFAULT_CONSENT_NOTICE: ConsentNoticeContent = {
  purposeText:
    'We use the details you enter here to respond to your enquiry, prepare a quotation, and keep a record of our correspondence with you. We also record your IP address and the page you submitted from, to help us detect abuse of this form.',
  enquiryLabel:
    'I agree that my details may be used to respond to this enquiry and to contact me about it.',
  marketingLabel:
    'Optional: I would also like to receive product news, offers and event invitations by email.',
  termsLabel: 'I have read and accept the Terms & Conditions.',
  withdrawalText:
    'You can withdraw your consent at any time, or ask what we hold about you, by emailing the address on our Privacy Policy. Withdrawing consent does not affect anything we did before you withdrew it.',
  privacyUrl: '/privacy',
  privacyVersion: null,
  termsUrl: '/terms',
  termsVersion: null,
};

/**
 * A ticked box, read strictly.
 *
 * `z.coerce.boolean()` reads the string "false" as true, because it is a
 * non-empty string — it would record consent nobody gave. Only the tokens a
 * checkbox actually posts count as ticked; anything else is unticked.
 *
 * `undefined` survives, because "this page did not send the field" and "the
 * visitor left it unticked" are different facts: the first is how a page
 * rendered before the combined control is recognised.
 */
const ticked = z
  .unknown()
  .optional()
  .transform((value) =>
    value === undefined || value === null
      ? undefined
      : value === true || value === 'true' || value === 'on' || value === '1' || value === 'yes',
  );

/** What the browser sends back. Nothing here defaults to accepted. */
export const consentSubmissionSchema = z.object({
  /**
   * The notice family and version the visitor was actually shown.
   *
   * Version 0 is a real value, not a missing one: it is `BUILT_IN_NOTICE_VERSION`,
   * returned for a site with no notice stored. Rejecting it would reject every
   * submission on such a site — and because this object sits inside the
   * submission envelope, the rejection is the *whole envelope* failing to
   * parse, which the visitor sees as an unexplained "could not be read" on a
   * form they filled in correctly.
   *
   * So nothing in this object can fail the parse. A value we cannot read
   * degrades to "unknown", which costs only the staleness check; the evidence
   * records the server's own notice either way, so a mangled field can never
   * make the record claim more than it should.
   */
  noticeKey: z.string().trim().max(60).optional().catch(undefined),
  noticeVersion: z.coerce
    .number()
    .int()
    .min(BUILT_IN_NOTICE_VERSION)
    .optional()
    .catch(undefined),
  /** The one combined tick box. */
  accepted: ticked,
  /**
   * The three separate boxes a page rendered before this release still posts.
   * Read only when `accepted` is absent, so a browser holding a cached copy of
   * the old form keeps working during a rollout instead of being told to tick
   * a box it never showed.
   */
  enquiry: ticked,
  marketing: ticked,
  terms: ticked,
});

export type ConsentSubmission = z.infer<typeof consentSubmissionSchema>;

/**
 * What a form asks of a visitor, resolved from its own settings and its notice.
 *
 * `presents*` is what the combined block actually puts on screen. Every
 * recorded permission is derived from these, never from the payload alone.
 */
export type ConsentRequirement = {
  /** False for a form that genuinely collects nothing personal. */
  applies: boolean;
  lawfulBasis: LawfulBasis;
  /** The combined box must be ticked for the submission to be accepted. */
  requireCheckbox: boolean;
  presentsEnquiry: boolean;
  presentsMarketing: boolean;
  presentsTerms: boolean;
  /** The wording beside the one visible checkbox. */
  combinedLabel: string;
  noticeKey: string;
  noticeVersion: number;
  noticeSource: NoticeSource;
  /** The stored row, when there is one. Null for the built-in wording. */
  noticeId: string | null;
  /** Null when the notice applies to every market; otherwise its country code. */
  noticeScope: string | null;
  notice: ConsentNoticeContent;
};

/** Does this requirement put a tick box on screen at all? */
export function showsCheckbox(requirement: ConsentRequirement): boolean {
  return (
    requirement.applies &&
    (requirement.presentsEnquiry || requirement.presentsTerms || requirement.presentsMarketing)
  );
}

export const CONSENT_MESSAGES = {
  combined: 'Please tick the box to confirm you agree, so we can respond to your enquiry.',
  stale:
    'Our privacy notice changed while you were filling this in. Please read it again and resubmit.',
} as const;

/**
 * The reason a form's consent settings cannot be rendered as one box.
 *
 * Marketing is optional by definition, so it cannot ride on a box the visitor
 * must tick to submit — that would make "send me marketing" a condition of
 * getting an answer. When a form both requires a tick and offers marketing,
 * the administrator has to choose, and this is the sentence that asks them to.
 *
 * Returns null when the settings are fine.
 */
export function marketingConflict(form: {
  collectsPersonalData: boolean;
  lawfulBasis: LawfulBasis;
  requireTermsAcceptance: boolean;
  offerMarketingConsent: boolean;
}): string | null {
  if (!form.collectsPersonalData || !form.offerMarketingConsent) return null;
  const requiresEnquiry = form.lawfulBasis === 'CONSENT';
  if (!requiresEnquiry && !form.requireTermsAcceptance) return null;

  const because = requiresEnquiry
    ? 'this form’s lawful basis is Consent, so its tick box is required'
    : 'this form requires Terms & Conditions acceptance, so its tick box is required';

  return `Marketing cannot be added to a required tick box: ${because}, and bundling optional marketing into it would make marketing a condition of submitting. Turn off “Offer marketing consent in the tick box” on this form, or change it so the tick box is not required.`;
}

/**
 * The default wording beside the combined box, built from what it covers.
 *
 * Composed rather than fixed, because a box that says "I agree to the
 * statements below" records an agreement to nothing in particular. An
 * administrator can replace it per form; this is what they start from.
 */
export function buildCombinedLabel(parts: {
  presentsEnquiry: boolean;
  presentsMarketing: boolean;
  presentsTerms: boolean;
}): string {
  const clauses: string[] = [];
  if (parts.presentsEnquiry) clauses.push('my details being used to respond to this enquiry');
  if (parts.presentsTerms) clauses.push('the Terms & Conditions');
  if (parts.presentsMarketing) clauses.push('receiving marketing emails');

  if (clauses.length === 0) return '';
  if (clauses.length === 1) return `I agree to ${clauses[0]}.`;
  const last = clauses[clauses.length - 1];
  return `I agree to ${clauses.slice(0, -1).join(', ')} and ${last}.`;
}

/**
 * One visitor's answer, split back into the three permissions.
 *
 * Every purpose is `ticked && presented`. A purpose the block did not show is
 * false no matter what arrives in the payload, which is what makes "hidden
 * marketing is never recorded as accepted" true by construction rather than by
 * remembering to check it at each call site.
 */
export type ConsentAnswer = {
  /** The combined control as the visitor left it. */
  accepted: boolean;
  enquiry: boolean;
  marketing: boolean;
  terms: boolean;
};

export function interpretConsent(
  requirement: ConsentRequirement,
  submitted: ConsentSubmission | undefined,
): ConsentAnswer {
  const none: ConsentAnswer = { accepted: false, enquiry: false, marketing: false, terms: false };
  if (!requirement.applies || !submitted) return none;

  if (submitted.accepted !== undefined) {
    const accepted = submitted.accepted === true;
    return {
      accepted,
      enquiry: accepted && requirement.presentsEnquiry,
      marketing: accepted && requirement.presentsMarketing,
      terms: accepted && requirement.presentsTerms,
    };
  }

  /*
   * A page rendered before the combined control. Its three boxes are read as
   * themselves — more precise than folding them together, and it keeps a
   * visitor who ticked "enquiry" but not "marketing" on a cached page recorded
   * exactly as they answered.
   */
  const enquiry = submitted.enquiry === true && requirement.presentsEnquiry;
  const terms = submitted.terms === true && requirement.presentsTerms;
  const marketing = submitted.marketing === true && requirement.presentsMarketing;
  const accepted =
    (!requirement.presentsEnquiry || enquiry) && (!requirement.presentsTerms || terms);

  return { accepted, enquiry, marketing, terms };
}

/**
 * Judges a submitted consent payload against what the form asks for.
 *
 * Runs on the server from the stored form and notice, never from anything the
 * page sent, so a crafted request cannot present itself as a form that did not
 * require consent. Marketing is never a reason to reject: it is only ever
 * offered on a box that is optional in the first place.
 */
export function validateConsent(
  requirement: ConsentRequirement,
  submitted: ConsentSubmission | undefined,
): { ok: true } | { ok: false; field: 'consent' | 'notice'; message: string } {
  if (!requirement.applies) return { ok: true };

  const answer = interpretConsent(requirement, submitted);

  if (requirement.requireCheckbox && !answer.accepted) {
    return { ok: false, field: 'consent', message: CONSENT_MESSAGES.combined };
  }

  /*
   * The version the visitor ticked against must be the version we are still
   * serving. Otherwise the evidence would claim they agreed to wording they
   * never saw — the page could have been open since before an edit. Asking
   * them to read it again is the only honest outcome.
   *
   * Only when the box is required: a form that does not ask for a decision has
   * no agreement to be stale.
   */
  if (requirement.requireCheckbox && submitted) {
    const versionMismatch =
      submitted.noticeVersion !== undefined && submitted.noticeVersion !== requirement.noticeVersion;
    const keyMismatch =
      submitted.noticeKey !== undefined && submitted.noticeKey !== requirement.noticeKey;
    if (versionMismatch || keyMismatch) {
      return { ok: false, field: 'notice', message: CONSENT_MESSAGES.stale };
    }
  }

  return { ok: true };
}

/**
 * The evidence row's payload, built from the requirement and the answer.
 *
 * The notice is snapshotted rather than referenced alone, because the record
 * has to keep saying what was on screen even after the notice is superseded or
 * the row is removed — including which of the three purposes the combined box
 * actually covered, and the exact sentence beside it.
 */
export function buildConsentEvidence(
  requirement: ConsentRequirement,
  submitted: ConsentSubmission | undefined,
) {
  const answer = interpretConsent(requirement, submitted);
  const displayed = {
    combinedLabel: requirement.combinedLabel,
    enquiry: requirement.presentsEnquiry ? requirement.notice.enquiryLabel : null,
    marketing: requirement.presentsMarketing ? requirement.notice.marketingLabel : null,
    terms: requirement.presentsTerms ? requirement.notice.termsLabel : null,
    privacyUrl: requirement.notice.privacyUrl,
    termsUrl: requirement.presentsTerms ? requirement.notice.termsUrl : null,
    withdrawalText: requirement.notice.withdrawalText,
  };

  return {
    noticeKey: requirement.noticeKey,
    noticeVersion: requirement.noticeVersion,
    noticeScope: requirement.noticeScope,
    noticeSnapshot: { ...requirement.notice, displayed } as unknown as Record<string, unknown>,
    purposeText: requirement.notice.purposeText,
    lawfulBasis: requirement.lawfulBasis,
    displayedLabel: showsCheckbox(requirement) ? requirement.combinedLabel : null,
    enquiryConsent: answer.enquiry,
    marketingConsent: answer.marketing,
    marketingPresented: requirement.presentsMarketing,
    termsAccepted: answer.terms,
    termsRequired: requirement.presentsTerms,
    privacyUrl: requirement.notice.privacyUrl,
    privacyVersion: requirement.notice.privacyVersion ?? null,
    termsUrl: requirement.notice.termsUrl,
    termsVersion: requirement.notice.termsVersion ?? null,
  };
}

/** How the CRM should describe one lead's consent, without flattening it. */
export type ConsentDisplayState = 'RECORDED' | 'NOT_RECORDED' | 'WITHDRAWN' | 'NOT_APPLICABLE';

export const CONSENT_DISPLAY_LABELS: Record<ConsentDisplayState, string> = {
  RECORDED: 'Recorded',
  NOT_RECORDED: 'Not recorded',
  WITHDRAWN: 'Withdrawn',
  NOT_APPLICABLE: 'Not applicable',
};

/**
 * Reduces one consent record to a column value.
 *
 * A lead with no record reads "Not recorded" and never "Recorded": leads
 * captured before consent evidence existed have no evidence, and showing them
 * as consented would be inventing it. Nothing backfills this.
 */
export function consentDisplayState(
  record:
    | {
        lawfulBasis: LawfulBasis;
        enquiryConsent: boolean;
        withdrawnAt: Date | null;
      }
    | null
    | undefined,
): ConsentDisplayState {
  if (!record) return 'NOT_RECORDED';
  if (record.withdrawnAt) return 'WITHDRAWN';
  // A submission processed on a basis other than consent has no tick box to
  // be missing, so an empty one is not a gap.
  if (record.lawfulBasis !== 'CONSENT') return 'NOT_APPLICABLE';
  return record.enquiryConsent ? 'RECORDED' : 'NOT_RECORDED';
}

/**
 * How a lead's marketing permission should read, keeping "never asked" apart
 * from "asked and declined".
 *
 * `marketingPresented` is null on every record written before the combined box
 * existed, and that stays "Not recorded" rather than being guessed either way.
 */
export function marketingDisplayState(
  record:
    | { marketingConsent: boolean; marketingPresented: boolean | null; withdrawnAt: Date | null }
    | null
    | undefined,
): 'AGREED' | 'DECLINED' | 'NOT_OFFERED' | 'WITHDRAWN' | 'NOT_RECORDED' {
  if (!record) return 'NOT_RECORDED';
  if (record.withdrawnAt) return 'WITHDRAWN';
  if (record.marketingPresented === null) {
    return record.marketingConsent ? 'AGREED' : 'NOT_RECORDED';
  }
  if (!record.marketingPresented) return 'NOT_OFFERED';
  return record.marketingConsent ? 'AGREED' : 'DECLINED';
}

export const MARKETING_DISPLAY_LABELS: Record<
  ReturnType<typeof marketingDisplayState>,
  string
> = {
  AGREED: 'Agreed',
  DECLINED: 'Declined',
  NOT_OFFERED: 'Not offered',
  WITHDRAWN: 'Withdrawn',
  NOT_RECORDED: 'Not recorded',
};
