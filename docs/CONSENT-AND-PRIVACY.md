# Consent and privacy

What this application does, what it deliberately does not claim, and the
decisions that still need a person.

---

## What is not claimed

**Collecting a tick does not make this site compliant with the DPDP Act, the
GDPR, or any other law.** This codebase provides the mechanics — a notice that
can be worded and versioned, three separate permissions, server-side
enforcement, an evidence trail, a withdrawal route, and access controls over
the personal data collected. Whether those mechanics add up to lawful
processing depends on decisions nobody but the business can make, listed at the
end of this document.

Nothing in the admin UI says "you are now compliant", and nothing should be
added that does.

---

## How consent works

### One chokepoint

Every public form on the site — contact, enquiry, product and plan forms, hero
and embedded forms, popups, callback and quotation forms, and anything an
administrator builds in the CMS — submits through one server action,
`submitForm` in `src/lib/actions/submit-form.ts`. Consent is enforced there, so
adding a new form cannot accidentally create a route that skips it.

### One tick box, three permissions

A public form shows **one** checkbox. Behind it there are still three separate
permissions, because the CRM has to be able to answer each of them separately:

| Permission | Required? | Stored as |
|---|---|---|
| Enquiry processing | Yes, when the form's lawful basis is `CONSENT` | `ConsentRecord.enquiryConsent` |
| Marketing | Never | `ConsentRecord.marketingConsent` |
| Terms acceptance | Only when the form asks for it | `ConsentRecord.termsAccepted` |

Three boxes made a visitor work through three decisions to send one enquiry, and
two of them were not decisions at all — they were a gate with two latches. One
box, with everything it covers written out beneath it, asks the same question
once.

**Each permission is `ticked && displayed`.** A purpose the block did not put on
screen is recorded as `false` no matter what the payload contains, which is what
makes "hidden marketing is never recorded as accepted" true by construction
rather than by remembering to check it at each call site. `interpretConsent` is
the one place that decides this.

`ConsentRecord.marketingPresented` records whether marketing was on screen at
all, so **"not offered"** and **"offered and declined"** stay different facts.
It is `null` on every record written before this existed, and that reads "not
recorded" rather than being guessed either way.

### Marketing is optional, and may be switched off entirely

Three things must all be true before a form asks for marketing consent:

1. the form has **Offer marketing consent in the tick box** on,
2. the live notice has **non-empty marketing wording**, and
3. the tick box is **not required**.

The third is the one that cannot be configured around. Marketing riding on a box
the visitor must tick to submit would make "send me marketing" the price of
getting a reply, so the admin refuses to save that combination — naming the
switch to change — and `resolveConsentRequirement` drops marketing from any form
that already holds it. No form can put marketing behind a mandatory tick.

Clearing the marketing wording in Admin → Leads & CRM → Consent notice is a
decision, not a gap: nothing renders, no blank line or empty container is left
behind, and the built-in wording is **not** substituted back. The built-in
wording applies only while nothing has been published at all.

### The wording beside the box

`Form.consentCombinedLabel` holds the sentence, editable per form in Admin →
Forms → *a form* → Settings. Empty composes one from exactly the purposes the
box covers — "I agree to my details being used to respond to this enquiry and
the Terms & Conditions." — so it can never name something that is not on screen.

The exact sentence shown is stored on every submission in
`ConsentRecord.displayedLabel`, and the full picture of what was rendered in
`noticeSnapshot.displayed`. Neither is ever backfilled: a record written before
the combined box has `null`, and is never rewritten as having accepted wording
nobody showed it.

Nothing about this makes the site compliant with anything. It is a set of
controls that supports DPDP/GDPR requirements; the decisions are still below.

### The box starts unticked

Unticked on mount, never seeded from anything, and no "by submitting you agree"
wording standing in for a choice. A box that arrives pre-ticked has not recorded
a decision, whatever the evidence row later says about it.

A tick is read only from the tokens a checkbox actually posts — `true`, `on`,
`1`, `yes`. `z.coerce.boolean()` is deliberately not used: it reads the string
`"false"` as `true`, because it is a non-empty string, which would record
consent nobody gave.

### Enforcement is server-side

What a form requires is re-read from the database on every submission — from
the `Form` row and the live `ConsentNotice` — never from the payload's own
account of what was required. A crafted request that omits the consent object
entirely therefore **fails** the requirement rather than skipping it.

```
tests/integration/consent.test.ts
  → "rejects a direct submission that omits the consent object entirely"
tests/integration/consent-combined.test.ts
  → the built-in notice, a published notice, a stale one, and market scoping
```

### Notices are versioned and immutable

Editing the wording in the admin publishes a **new version**; the previous one
is never modified. A submission stores:

- the notice key and version it was shown,
- a full snapshot of the wording as rendered,
- the Privacy Policy and Terms URLs and their versions,
- the purpose text.

The snapshot exists because a notice row can be deleted or a market removed,
and the evidence still has to say what was on screen. If the page was open
since before an edit, the submission is rejected with "our privacy notice
changed while you were filling this in" rather than recording agreement to
wording the person never saw.

#### Version 0 means "nothing published yet"

A site with no notice published in the admin still has to show one, so the
form falls back to the wording compiled into the code and records it as
**version 0**. A stored notice always starts at 1, so the two can never be
confused, and a lead captured that way reads *"default — built-in wording"*
rather than *"v0"* in Leads → Consent & privacy.

Version 0 is a real, valid version and must be accepted everywhere a stored
one is. Treating it as missing or invalid rejects the whole submission
envelope, which the visitor sees as "that submission could not be read" on a
form they filled in correctly — and it would do so on every public form of
every fresh deployment, because nothing seeds a notice.

Publishing wording in Admin → Leads & CRM → Consent notice replaces the fallback
from version 1 onwards. Doing that is one of the open decisions below.

#### Publishing is scoped to one market

"Current" is per notice key **and per market**. Publishing UAE wording
supersedes the previous UAE notice for that key and nothing else — not the
shared notice every other market falls back to, and not another country's.
Superseding by key alone meant publishing wording for one market silently left
every other market with no live notice at all, falling back to the built-in
wording without anyone being told.

Version numbers are allocated per key across every scope, so `key` + `version`
in a consent record identifies exactly one row of wording. Two administrators
publishing at once is handled by retrying the version number rather than failing
in front of whoever was second.

### Withdrawal

Recording a withdrawal (Leads → a lead → Consent & privacy → *Record a
withdrawal*) appends a `ConsentEvent` and sets `withdrawnAt`. **The original
booleans are not edited.** The history then reads "agreed on the 3rd, withdrew
on the 9th" rather than "never agreed".

Withdrawing also sets `Lead.marketingSuppressedAt`, which is what campaign
sending reads — a withdrawal that only updated the evidence would leave the
record honest and the mailing list wrong.

---

## IP addresses

### Why the forwarded header is not simply read

`x-forwarded-for` is a request header: anyone can send one. Behind a proxy the
header is genuine, but only for the hops the proxy itself appended — everything
to the left of those was supplied by the client and can say anything. Reading
`split(',')[0]` records whatever the visitor typed, which is the opposite of
evidence.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `TRUSTED_PROXY_COUNT` | `0` | How many proxies append to `x-forwarded-for` before the app sees it. |
| `TRUSTED_IP_HEADER` | unset | A single header an edge overwrites, e.g. `cf-connecting-ip`. |
| `IP_RETENTION_DAYS` | `365` | How long a stored address is kept. |

**Set `TRUSTED_PROXY_COUNT` to match the deployment**, or no address is
recorded at all:

- Direct to the container, nothing in front → `0`
- One reverse proxy (Traefik, Nginx, Coolify, an Azure Container Apps ingress)
  → `1`
- A CDN in front of that proxy → `2`

Only set `TRUSTED_IP_HEADER` when that edge is genuinely in front of the app.
The header is otherwise just another thing a client can send.

### What is stored, and why "no address" has three meanings

`Lead.ipStatus` and `FormSubmission.ipStatus` record which case applies:

| Status | Meaning |
|---|---|
| `RECORDED` | Read from a hop the deployment trusts. |
| `UNAVAILABLE` | No address was offered at all. |
| `UNTRUSTED` | A forwarded address arrived from a hop that is not trusted, and was discarded. |
| `PURGED` | Recorded once, then removed by the retention period. |

A bare null would conflate all four.

### Other guarantees

- **No browser-supplied IP field is accepted.** There is no such input; the
  resolver only reads headers, and only the trusted hop of those.
- **IPv4 and IPv6** both parse, including `::ffff:` mapped form, compression,
  ports and brackets.
- **IP geolocation is never the source of the selected country.** The market
  comes from the URL prefix the visitor actually requested.
- **Access is a separate permission** (`leads.viewIp`). The address is not sent
  to the browser at all for a user without it, and the export column is absent
  rather than blank.
- **Collection is disclosed** in the default notice's purpose text.

### Retention

`IP_RETENTION_DAYS` is read by `ipRetentionDays()`. **A scheduled purge is not
yet wired up** — see the open decisions below.

---

## Where the controls are

| Control | Location |
|---|---|
| Notice wording, purpose, withdrawal text, policy links and versions | Admin → Leads & CRM → **Consent notice** |
| Marketing wording — including clearing it to stop asking anywhere | Admin → Leads & CRM → **Consent notice** → Marketing |
| Per-form lawful basis, marketing, Terms, "collects personal data" | Admin → Forms → *a form* → **Settings** tab → Consent |
| The sentence beside the tick box | Admin → Forms → *a form* → **Settings** tab → Tick box wording |
| Consent column and filter | Admin → **Leads** |
| Evidence, history, withdrawal, IP | Admin → Leads → *a lead* → **Consent & privacy** |
| Submitted fields with original labels | Admin → Leads → *a lead* → **Submitted form** |
| Consent columns in exports | Admin → Leads → **Export** |

Permissions: `leads.view` to read, `leads.viewIp` for addresses,
`leads.manageConsent` to publish notices and record withdrawals,
`leads.export` for exports.

---

## Open decisions — these need a person

These are not defects. They are choices the code cannot make.

1. **Which law applies to which market.** The DPDP Act and the GDPR differ on
   lawful bases, children's data, notice content and cross-border transfer. The
   application supports one notice per market; which markets need their own
   wording is a business call.

2. **Commencement.** The DPDP Act's obligations commence in stages by
   notification. Whether the obligations this implements are in force for your
   operations on a given date needs checking against the current notifications —
   the code does not gate anything on a date.

3. **Lawful basis per form.** Every form defaults to `CONSENT`, which makes the
   tick box mandatory. A quotation request may be better placed on contract
   performance, and a fraud-prevention log on legitimate interest. Each form's
   basis is now a setting; someone has to set it.

4. **Whether the default purpose text is true.** The shipped wording says the
   details are used to respond to the enquiry, prepare a quotation, keep a
   record of correspondence, and that the IP is recorded to detect abuse. If the
   business does more than that — enrichment, scoring, sharing with a vendor —
   the notice must say so before consent to it means anything.

5. **Retention periods, and the purge job.** `IP_RETENTION_DAYS` is read but
   nothing deletes on a schedule yet. Decide the period for IP addresses, for
   submissions, and for leads, then wire a purge into the existing cron route
   (`/api/internal/cron/backup` is the model). Until then, addresses are kept
   indefinitely.

6. **The Privacy Policy and Terms pages themselves.** The notice links to
   `/privacy` and `/terms` by default. Those pages must exist, must actually
   describe this processing, and must carry the version strings entered in the
   notice.

7. **A data-subject request route.** The withdrawal text points at "the address
   on our Privacy Policy". Someone has to own that mailbox and a process for
   access, correction and erasure requests. The admin can record a withdrawal;
   it cannot answer an access request on its own.

8. **Existing leads.** Leads captured before this shipped have no consent
   evidence and display "Not recorded". **Nothing backfills them, and nothing
   should.** Whether those leads may still be contacted, and on what basis, is a
   decision to take deliberately.

9. **Notifying the notice change.** Publishing a new notice version does not
   notify anyone who consented to an earlier one. Whether a material change
   requires re-consent is a legal judgement.

10. **Processors.** Submissions are emailed to notification addresses and may
    pass through an SMTP provider. Those are processors, and the notice does not
    currently name them.
