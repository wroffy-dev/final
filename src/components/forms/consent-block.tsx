'use client';

import * as React from 'react';
import { showsCheckbox, type ConsentRequirement } from '@/lib/privacy/consent';

/**
 * The consent block under a public form.
 *
 * **One** tick box, whatever the form asks for. Three boxes made a visitor
 * work through three decisions to send one enquiry, and the two that were
 * mandatory were not really decisions at all — they were a gate with two
 * latches. One box, with everything it covers written out beneath it, asks the
 * same question once and reads as a sentence rather than a checklist.
 *
 * What the box covers is still recorded separately, because "did this person
 * agree to marketing?" and "did this person accept the Terms?" are different
 * questions the CRM has to answer. That split happens on the server, from what
 * this block actually displayed — never from the box alone.
 *
 * The box starts unticked and is never pre-selected. Marketing wording only
 * appears when the box is optional, so ticking to get an answer can never also
 * mean subscribing.
 *
 * The policy links open in a new tab. A visitor who wants to read the privacy
 * notice before ticking must not lose what they have typed to do it.
 */
export function ConsentBlock({
  requirement,
  checked,
  onChange,
  errors,
  idPrefix,
}: {
  requirement: ConsentRequirement;
  checked: boolean;
  onChange: (next: boolean) => void;
  errors: Record<string, string[]>;
  idPrefix: string;
}) {
  const id = `${idPrefix}-consent`;
  const detailId = `${id}-detail`;
  const errorId = `${id}-error`;

  if (!requirement.applies) return null;

  const notice = requirement.notice;
  const error = errors._consent?.[0] ?? errors._consentNotice?.[0];
  const hasBox = showsCheckbox(requirement);

  const privacyHref = policyHref(notice.privacyUrl);
  const termsHref = requirement.presentsTerms ? policyHref(notice.termsUrl) : null;

  return (
    <div className="fd-consent mt-4 space-y-3 text-sm">
      <p className="fd-help leading-relaxed">{notice.purposeText}</p>

      {hasBox ? (
        <div>
          {/*
            * A real <input type="checkbox"> inside its <label>: the whole line
            * is clickable, Space toggles it, and a screen reader reads the
            * wording as the control's name. The detail below is attached with
            * aria-describedby rather than folded into the name, so the name
            * stays one readable sentence.
            */}
          <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 leading-relaxed">
            <input
              id={id}
              type="checkbox"
              checked={checked}
              onChange={(event) => onChange(event.target.checked)}
              aria-required={requirement.requireCheckbox || undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={[detailId, error ? errorId : null].filter(Boolean).join(' ')}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
            />
            <span>
              {requirement.combinedLabel}
              {requirement.requireCheckbox ? (
                <span className="fd-required" aria-hidden="true">
                  {' '}
                  *
                </span>
              ) : null}
            </span>
          </label>

          {error ? (
            <p id={errorId} role="alert" className="fd-error mt-1 pl-[1.625rem]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        * What the box covers, in full. Only the purposes actually in force
        * appear — a form that does not ask for Terms shows no Terms sentence
        * and no Terms link, so there is nothing on screen the record cannot
        * account for.
        */}
      <div id={detailId} className="fd-consent-detail space-y-1.5">
        {requirement.presentsEnquiry ? (
          <p className="fd-help leading-relaxed">{notice.enquiryLabel}</p>
        ) : null}
        {requirement.presentsMarketing ? (
          <p className="fd-help leading-relaxed">{notice.marketingLabel}</p>
        ) : null}
        {requirement.presentsTerms ? (
          <p className="fd-help leading-relaxed">{notice.termsLabel}</p>
        ) : null}

        <p className="fd-help leading-relaxed">
          {notice.withdrawalText}
          {privacyHref ? (
            <>
              {' '}
              <PolicyLink href={privacyHref} version={notice.privacyVersion}>
                Privacy Policy
              </PolicyLink>
            </>
          ) : null}
          {termsHref ? (
            <>
              {privacyHref ? ' · ' : ' '}
              <PolicyLink href={termsHref} version={notice.termsVersion}>
                Terms &amp; Conditions
              </PolicyLink>
            </>
          ) : null}
        </p>
      </div>

      {!hasBox && error ? (
        <p role="alert" className="fd-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A policy link target, or null when there is nothing safe to link to.
 *
 * An unconfigured or unusable URL produces no link rather than a dead one: a
 * consent notice pointing at `javascript:` or at nothing is worse than a
 * notice that simply does not offer the link.
 */
function policyHref(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

/**
 * A policy link that opens in a new tab.
 *
 * `target="_blank"` is the whole point: following it in place would discard a
 * half-filled form, and a visitor who has to choose between reading the notice
 * and keeping their answers is not being given a real choice.
 */
function PolicyLink({
  href,
  version,
  children,
}: {
  href: string;
  version?: string | null;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="fd-consent-link underline">
      {children}
      {version ? ` (v${version})` : null}
    </a>
  );
}
