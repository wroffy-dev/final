# Form design and field flexibility

Every form on this site — lead, contact, popup, hero, CTA, product enquiry,
CMS block, landing page, footer — is drawn by **one renderer** from **one design
schema**. There is no per-location form styling anywhere in the codebase, and
adding a form somewhere new gets the whole control set for free.

Configured at **Admin → Forms → (form) → Design**.

---

## Where the pieces live

| Piece | File |
| --- | --- |
| Design schema + CSS compiler | `src/lib/forms/form-design.ts` |
| Per-field settings + conditions | `src/lib/forms/field-settings.ts` |
| System field context | `src/lib/forms/system-context.ts` |
| The one renderer | `src/components/forms/public-form.tsx` |
| Client-side loader (popups, dialogs) | `src/components/forms/form-loader.tsx` |
| Stylesheet the variables drive | `src/app/globals.css` (`.fd-*`) |
| Admin Design tab | `src/components/admin/forms/form-design-panel.tsx` |
| Server-side validation | `src/lib/validation/form-submission.ts` |

Storage is two additive columns: `Form.design` (JSON) and `FormField.settings`
(JSON) plus a handful of boolean columns on `FormField`. Nothing was migrated:
a form with `design = NULL` renders exactly as it did before this existed.

### Why CSS custom properties, not classes

The renderer emits variables; `globals.css` consumes them with fallbacks equal
to the original appearance:

```css
.fd-control {
  border-radius: var(--fd-input-radius, 0.5rem);
  background-color: var(--fd-input-bg, rgb(var(--brand-surface)));
}
```

That is what makes an admin typing `37px`, `4.5rem` or `85%` work at three
breakpoints without generating a byte of extra Tailwind — and why a popup form
and a hero form can look nothing alike while sharing one code path. A form
nobody has restyled sets no variables and emits **no CSS at all** (there is a
test for this).

State styling — focus, hover, disabled, error — cannot be inline, so it becomes
real rules scoped to the form's generated class (`.fd-contact-us`).

---

## The design controls

Ten groups, per §2 of the brief:

**Layout** — columns (1–4, per breakpoint), alignment, width, max width,
full-width toggle.
**Spacing** — outer margin, inner padding, row/column gap, label, help-text and
button spacing. Units: px, %, rem, em, vw, vh.
**Form container** — background (transparent / solid / gradient / image with
overlay), border style/width/colour/radius, shadow, backdrop blur.
**Typography** — font family (from the project's existing Google Fonts
catalogue), size, weight, line height, letter spacing, capitalisation and colour
for base, labels, inputs, placeholders, help text, button and error text.
**Fields** — height, min height, padding, background, border, plus focus, hover,
disabled and error states. Textarea rows and resize. Checkbox/radio size, accent
colour, gap and layout.
**Labels** — position (above / beside / floating), required-marker visibility and
colour, full typography.
**Placeholders** — opacity and typography.
**Submit button** — alignment, width, height, padding, colours, hover / pressed /
disabled states, border, icon and position, and the "sending" text.
**Validation** — error spacing and typography, invalid input border and
background, and the default messages.
**Success message** — behaviour (inline / replace the form / redirect), heading,
icon, colours, padding and border.

Responsive: a sticky Desktop / Tablet / Mobile switch sits at the top of the
panel. Empty inherits upwards (mobile → tablet → desktop → the renderer's
default), so only the breakpoints actually touched emit CSS.

Columns narrow towards mobile rather than widening: 3 columns on desktop derives
2 on tablet and 1 on mobile unless overridden, because a form that fits three
columns on a laptop never does on a phone.

---

## Field flexibility

Every field can be added, removed, duplicated, reordered (drag or keyboard) and
individually configured:

- label text and **Show label** on/off
- placeholder (only offered for types that support one)
- help text, default value
- **Required**, **Enabled**, **Hidden**, **Read-only**, **System field**
- width, **column span** (1–4 or full row)
- validation: min/max length, min/max value, pattern, per-field messages
- CSS classes
- conditional visibility

### Accessibility is not negotiable

Turning a label off removes the visible text only — the renderer moves the
accessible name to `aria-label`, so the field keeps working for anyone using a
screen reader. Checkboxes and radios stay native `<input>` elements: keyboard
and screen-reader behaviour is unchanged whatever size or accent colour is set.
Floating labels are real `<label>` elements positioned with CSS
`:placeholder-shown`, with no JavaScript and no effect on the accessible name.

### Field types

Text, Email, Phone, Number, Paragraph, Dropdown, **Multi-select**, Radio,
Checkbox, Date, **Time**, URL, Consent, Hidden, Name, Company. Multi-select and
Time are new; nothing was removed.

**File upload is deliberately not implemented.** The brief made it conditional
on the existing architecture supporting it safely, and it does not: these forms
are public and unauthenticated, so accepting uploads would mean anonymous
writes to storage with quota, content-scanning and retention questions attached.
It belongs behind its own design, not bolted onto this.

### Conditional visibility

A flat list of up to five tests joined by one operator (`all` / `any`), with
`is`, `is not`, `contains`, `is empty`, `is not empty`. Deliberately not a
nested rules engine — that covers "show Company Size when Product Interest is
Dropbox Business" without building a tree nobody can debug from an admin screen.

A condition naming a field that no longer exists is **ignored**, not treated as
failed: a renamed field should not silently stop collecting an answer.

---

## Server-side enforcement

This is the half that matters. The client decides what to draw; the server
decides what is true.

`buildFieldSchema()` is rebuilt from the **stored** field definitions on every
submission, so a tampered payload cannot relax a required field, widen an
option list or skip a pattern. On top of that, `activeFields()` decides which
fields a submission is judged against at all — skipping any field the visitor
could not have answered:

| Field state | Required of the visitor? | Value recorded |
| --- | --- | --- |
| Normal | Yes, if marked required | What they typed |
| Read-only | No | The admin's default |
| Hidden | No | The admin's default |
| System | No | Resolved from the trusted product id |
| Conditions unmet | No | Empty |
| Disabled | Not in the form at all | — |

So a crafted request cannot:

- satisfy a required field by hiding it (visibility is recomputed server-side
  from the payload, not taken from the client);
- rewrite a read-only or hidden value (the default replaces whatever was sent);
- claim an enquiry was about a different product (see below).

`HIDDEN`-type fields are the one deliberate exception: they predate these flags
and are filled by page scripts today, so taking their value from the server
would change behaviour forms already depend on.

---

## Integration by location

There is nothing to configure per location. Each host chooses *which* form and
where it sits; the form's own design does the rest.

**Product enquiry** (`product-cta.tsx`) — opens the product's form in a dialog.
Product context is available as **system fields**: name a field `product_id`,
`product_name`, `product_slug`, `product_sku`, `plan`, `billing_period` or
`price` and tick *System field*.

The value shown to the visitor comes from the component; **the value recorded
comes from the server**, resolved from the trusted `productId` that arrived with
the submission. That split is the §22 guarantee — an admin can put a product
name on any form without creating a way for a crafted request to claim the
enquiry was about something else. There is a test that submits
`product_name: "Something Else Entirely"` and asserts the real product name is
stored.

**Popups** (`popup-host.tsx`) — popup width, position, overlay, close button and
trigger stay popup settings. The form's design comes entirely from the form.
No field styling exists in popup code.

**Hero** (`hero-block.tsx`) — the hero picks the form and styles its own panel;
typography, fields and button come from the form's design.

**CMS blocks** (`conversion-blocks.tsx`) — same renderer, same design.

**Lead capture** is unchanged: lead source, UTM capture (first and last touch),
product attribution, form attribution and page attribution all work exactly as
before. The 599-test suite includes the existing attribution and submission
tests, which were not modified.

---

## Security

Every value that reaches a style attribute or a stylesheet is narrowed by the
schema first:

- **Lengths** must match `-?\d+(\.\d+)?(px|%|rem|em|vw|vh)`; a bare number
  becomes px; anything else becomes empty.
- **Colours** must be 6- or 8-digit hex, `rgb()` or `rgba()`. `red; background:
  url(...)`, `#fff"><script>`, `expression(...)` and `}.x{color:red` all become
  empty.
- **Font families** have quotes, semicolons, braces and parens stripped.
- **Button icons** are validated against a closed set of eleven components.
- **CSS classes** are reduced to a token list (max 8 tokens, 40 chars each) that
  cannot contain a quote, `=`, `<` or `>`.
- **The generated class name** is derived from the slug with everything outside
  `[A-Za-z0-9_-]` removed, so nothing admin-entered reaches a selector.

Only declaration *values* are ever interpolated — never a selector, a property
name or a rule boundary. There is a test that feeds hostile values through the
compiler and asserts no brace or semicolon survives into the stylesheet.

A stored design is parsed with `.catch()` on every field and a `safeParse`
fallback, so a row written by a future version, or hand-edited to nonsense,
renders with defaults instead of throwing a page away.

---

## Existing data

- `Form.design` and `FormField.settings` are nullable and default to null.
- The new `FormField` booleans default to the behaviour a field already had:
  `showLabel = true`, `isEnabled = true`, `isHidden = false`,
  `isReadOnly = false`.
- `colSpan` is null, meaning "derive from `width`" — so a form saved before the
  column system keeps its half/full layout exactly.
- **Submitted data is untouched.** `FormSubmission.data` is JSON keyed by field
  name and is never rewritten. Disabling or deleting a field does not alter
  submissions already collected.
- The migration adds two enum values and eight nullable/defaulted columns.
  Nothing is dropped or altered.

---

## Limitations

1. **No file upload**, for the reasons above.
2. **Image backgrounds come from the hosting section's media picker**, not a
   picker inside the form's Design tab. One place to choose an image is better
   than two that can disagree; a form-level picker would need its own media
   field and relation.
3. **No live preview** in the Design tab. The controls are grouped and labelled
   so the effect is predictable, but confirming a design means opening the page.
4. **Conditions test one field each, one level deep.** No nested groups, no
   cross-form conditions, no arithmetic comparisons.
5. **Searchable dropdowns are not implemented** — `<select>` stays native, which
   keeps mobile and screen-reader behaviour correct. A custom combobox is a
   separate piece of work with real accessibility cost.
6. **Per-field typography is not exposed.** Typography is set per *voice*
   (labels, inputs, help, error) across the form rather than per field, which
   keeps a form visually coherent and the control count manageable.
7. **`pattern` accepts any regular expression.** It is evaluated server-side
   inside a try/catch and an invalid pattern never blocks a submission, but a
   pathological pattern on a long input could still be slow. Only staff with
   `forms.edit` can set one.
