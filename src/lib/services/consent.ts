import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import {
  BUILT_IN_NOTICE_VERSION,
  CONSENT_NOTICE_KEY_DEFAULT,
  DEFAULT_CONSENT_NOTICE,
  buildCombinedLabel,
  consentNoticeSchema,
  hasMarketingWording,
  type ConsentNoticeContent,
  type ConsentRequirement,
  type NoticeSource,
} from '@/lib/privacy/consent';
import { Prisma } from '@prisma/client';
import type { LawfulBasis } from '@prisma/client';

/**
 * Consent notices, resolved for rendering and for judging a submission.
 *
 * One rule decides which notice a form shows, and both the renderer and the
 * submission handler call it — so the wording a visitor ticked against is
 * necessarily the wording the server validates and stores. A second lookup
 * path here would be a way for those two to disagree, which is the one thing
 * the evidence must never do.
 */

type NoticeRow = {
  id: string;
  key: string;
  version: number;
  purposeText: string;
  enquiryLabel: string;
  marketingLabel: string;
  termsLabel: string;
  withdrawalText: string;
  privacyUrl: string;
  privacyVersion: string | null;
  termsUrl: string;
  termsVersion: string | null;
};

const NOTICE_SELECT = {
  id: true,
  key: true,
  version: true,
  purposeText: true,
  enquiryLabel: true,
  marketingLabel: true,
  termsLabel: true,
  withdrawalText: true,
  privacyUrl: true,
  privacyVersion: true,
  termsUrl: true,
  termsVersion: true,
} as const;

function toContent(row: NoticeRow): ConsentNoticeContent {
  return {
    purposeText: row.purposeText,
    enquiryLabel: row.enquiryLabel,
    marketingLabel: row.marketingLabel,
    termsLabel: row.termsLabel,
    withdrawalText: row.withdrawalText,
    privacyUrl: row.privacyUrl,
    privacyVersion: row.privacyVersion,
    termsUrl: row.termsUrl,
    termsVersion: row.termsVersion,
  };
}

/**
 * The live notice for a key, preferring a market-specific version.
 *
 * Falls back through: this market's notice for the key → the shared notice for
 * the key → the shared default → the wording compiled into the code. The last
 * step is what lets a site with no notice configured still render a truthful
 * block instead of a form with no notice at all.
 */
export type ResolvedNotice = {
  id: string | null;
  key: string;
  version: number;
  source: NoticeSource;
  /** Null when the notice applies to every market; otherwise the country code. */
  scope: string | null;
  content: ConsentNoticeContent;
};

export const getCurrentNotice = cache(
  async (key: string, countryId: string | null): Promise<ResolvedNotice> => {
    const candidates = await prisma.consentNotice.findMany({
      where: {
        isCurrent: true,
        key: { in: Array.from(new Set([key, CONSENT_NOTICE_KEY_DEFAULT])) },
        OR: [{ countryId: null }, ...(countryId ? [{ countryId }] : [])],
      },
      select: { ...NOTICE_SELECT, countryId: true, country: { select: { code: true } } },
      orderBy: { version: 'desc' },
    });

    const pick =
      candidates.find((row) => row.key === key && row.countryId === countryId) ??
      candidates.find((row) => row.key === key && row.countryId === null) ??
      candidates.find(
        (row) => row.key === CONSENT_NOTICE_KEY_DEFAULT && row.countryId === countryId,
      ) ??
      candidates.find(
        (row) => row.key === CONSENT_NOTICE_KEY_DEFAULT && row.countryId === null,
      );

    if (!pick) {
      return {
        id: null,
        key: CONSENT_NOTICE_KEY_DEFAULT,
        // `BUILT_IN_NOTICE_VERSION` marks "not from the database". A stored
        // notice always starts at 1, so evidence can never confuse the two —
        // and this is a real version that every layer must accept, not a
        // missing one.
        version: BUILT_IN_NOTICE_VERSION,
        source: 'BUILT_IN',
        scope: null,
        content: DEFAULT_CONSENT_NOTICE,
      };
    }

    return {
      id: pick.id,
      key: pick.key,
      version: pick.version,
      source: 'PUBLISHED',
      scope: pick.country?.code ?? null,
      content: toContent(pick),
    };
  },
);

/** What one form asks of a visitor, resolved from the form and its notice. */
export async function resolveConsentRequirement(
  form: {
    consentNoticeKey: string | null;
    lawfulBasis: LawfulBasis;
    offerMarketingConsent: boolean;
    requireTermsAcceptance: boolean;
    collectsPersonalData: boolean;
    /** The administrator's wording for the one tick box. Null uses the default. */
    consentCombinedLabel?: string | null;
  },
  countryId: string | null,
): Promise<ConsentRequirement> {
  const notice = await getCurrentNotice(
    form.consentNoticeKey || CONSENT_NOTICE_KEY_DEFAULT,
    countryId,
  );

  const applies = form.collectsPersonalData;

  // Only a consent basis makes the tick box the thing that authorises
  // processing. On any other basis the box would be theatre — and worse,
  // ticking it would imply a right to withdraw that the basis does not give.
  const presentsEnquiry = applies && form.lawfulBasis === 'CONSENT';
  const presentsTerms = applies && form.requireTermsAcceptance;
  const requireCheckbox = presentsEnquiry || presentsTerms;

  /*
   * Marketing appears only when there is something to show and nothing to
   * force. Three conditions, all of them necessary:
   *
   *  - the form offers it,
   *  - the live notice actually has marketing wording (an administrator who
   *    cleared it has said this site does not ask), and
   *  - the box is not required, because a required box carrying optional
   *    marketing would make marketing a condition of getting an answer.
   *
   * The third is the last line of defence. `marketingConflict` stops an
   * administrator saving that combination in the first place, but a form that
   * predates the rule, or one copied between markets, can still hold it — and
   * resolving it here means no such row can ever put marketing behind a
   * mandatory tick.
   */
  const presentsMarketing =
    applies &&
    form.offerMarketingConsent &&
    hasMarketingWording(notice.content.marketingLabel) &&
    !requireCheckbox;

  const parts = { presentsEnquiry, presentsMarketing, presentsTerms };

  return {
    applies,
    lawfulBasis: form.lawfulBasis,
    requireCheckbox,
    ...parts,
    // The administrator's own sentence when they wrote one; otherwise one
    // composed from exactly the purposes this box covers.
    combinedLabel: form.consentCombinedLabel?.trim() || buildCombinedLabel(parts),
    noticeKey: notice.key,
    noticeVersion: notice.version,
    noticeSource: notice.source,
    noticeId: notice.id,
    noticeScope: notice.scope,
    notice: notice.content,
  };
}

/** Every notice family, newest version first, for the admin list. */
export async function listNoticeVersions(key: string) {
  return prisma.consentNotice.findMany({
    where: { key },
    orderBy: { version: 'desc' },
    select: { ...NOTICE_SELECT, isCurrent: true, countryId: true, createdAt: true },
  });
}

export async function listNoticeKeys(): Promise<Array<{ key: string; versions: number }>> {
  const rows = await prisma.consentNotice.groupBy({ by: ['key'], _count: { key: true } });
  return rows.map((row) => ({ key: row.key, versions: row._count.key }));
}

/** How many times a publish retries a version number another publish took. */
const PUBLISH_ATTEMPTS = 5;

/**
 * Publishes a new version of a notice.
 *
 * Always an insert. The previous version stays exactly as it was, because
 * submissions point at it and the point of a version is that it does not
 * change under the evidence that cites it.
 *
 * **Scope.** "Current" is per key *and per market*. A UAE notice supersedes the
 * previous UAE notice for that key and nothing else — not the shared notice
 * every other market falls back to, and not another country's. Superseding by
 * key alone would mean publishing wording for one market silently left every
 * other market with no live notice, falling back to the wording built into the
 * code without anyone being told.
 *
 * **Versions** are allocated per key across all scopes, so `key` + `version` in
 * a consent record identifies exactly one row of wording. `@@unique([key,
 * version])` makes a duplicate impossible rather than unlikely; two
 * administrators publishing at once means one transaction loses the race and
 * retries with the next number, instead of failing in front of whoever was
 * second.
 */
export async function publishNotice(input: {
  key: string;
  countryId: string | null;
  content: ConsentNoticeContent;
  actorId: string | null;
}): Promise<{ id: string; version: number }> {
  const content = consentNoticeSchema.parse(input.content);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const latest = await tx.consentNotice.findFirst({
          where: { key: input.key },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        // Published versions are positive and increasing, which is what keeps
        // them distinguishable from BUILT_IN_NOTICE_VERSION.
        const version = Math.max(latest?.version ?? 0, BUILT_IN_NOTICE_VERSION) + 1;

        // Exactly one current version per key per scope. Inside the
        // transaction so a concurrent publish cannot leave two rows claiming
        // to be live in the same market. `countryId: null` matches IS NULL,
        // which is precisely the shared-notice scope.
        await tx.consentNotice.updateMany({
          where: { key: input.key, countryId: input.countryId, isCurrent: true },
          data: { isCurrent: false },
        });

        return tx.consentNotice.create({
          data: {
            key: input.key,
            version,
            isCurrent: true,
            countryId: input.countryId,
            createdById: input.actorId,
            ...content,
            privacyVersion: content.privacyVersion || null,
            termsVersion: content.termsVersion || null,
          },
          select: { id: true, version: true },
        });
      });
    } catch (error) {
      const lostTheRace =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!lostTheRace || attempt >= PUBLISH_ATTEMPTS) throw error;
    }
  }
}

/**
 * Records a withdrawal against an existing consent record.
 *
 * Nothing that was agreed is edited. The original booleans stay exactly as the
 * visitor left them, a `withdrawnAt` marks the record, and an event is
 * appended — so the history reads "agreed on the 3rd, withdrew on the 9th"
 * rather than "never agreed", which is what rewriting the row would produce.
 *
 * Marketing suppression is a separate flag on the lead, because that is what
 * campaign sending reads. A withdrawal that did not set it would leave the
 * record honest and the mailing list wrong.
 */
export async function withdrawConsent(input: {
  recordId: string;
  scope: 'MARKETING' | 'ALL';
  actorId: string | null;
  note: string | null;
  ipAddress: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const record = await prisma.consentRecord.findUnique({
    where: { id: input.recordId },
    select: { id: true, leadId: true, withdrawnAt: true, withdrawnScope: true },
  });
  if (!record) return { ok: false, error: 'That consent record no longer exists.' };
  if (record.withdrawnAt && record.withdrawnScope === 'ALL') {
    return { ok: false, error: 'Consent has already been withdrawn in full.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.consentRecord.update({
      where: { id: record.id },
      data: { withdrawnAt: new Date(), withdrawnScope: input.scope },
    });

    await tx.consentEvent.create({
      data: {
        recordId: record.id,
        type: 'WITHDRAWN',
        scope: input.scope,
        value: false,
        actorId: input.actorId,
        actorType: input.actorId ? 'STAFF' : 'VISITOR',
        note: input.note,
        ipAddress: input.ipAddress,
      },
    });

    if (record.leadId) {
      await tx.lead.update({
        where: { id: record.leadId },
        data: { marketingSuppressedAt: new Date() },
      });
    }
  });

  return { ok: true };
}

/** The fields the CRM needs to describe a lead's consent without guessing. */
export const CONSENT_RECORD_SELECT = {
  id: true,
  lawfulBasis: true,
  enquiryConsent: true,
  marketingConsent: true,
  marketingPresented: true,
  termsAccepted: true,
  termsRequired: true,
  displayedLabel: true,
  noticeScope: true,
  purposeText: true,
  noticeKey: true,
  noticeVersion: true,
  noticeSnapshot: true,
  privacyUrl: true,
  privacyVersion: true,
  termsUrl: true,
  termsVersion: true,
  consentedAt: true,
  withdrawnAt: true,
  withdrawnScope: true,
} as const;
