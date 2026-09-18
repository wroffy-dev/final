-- One combined consent tick box per form, and evidence of what it displayed.
--
-- Additive only. Every column is nullable with no default backfill, so:
--   * existing forms compose their label from the purposes they already show,
--   * existing consent records read "not recorded" for anything that did not
--     exist when they were written, and are never reinterpreted as having
--     accepted wording nobody showed them.

-- The administrator's wording for the one visible tick box. NULL composes it.
ALTER TABLE "Form" ADD COLUMN IF NOT EXISTS "consentCombinedLabel" TEXT;

-- Was marketing wording actually on screen when this was submitted?
-- NULL means "written before this was recorded", which is not the same as
-- false and must never be read as either an offer or a refusal.
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "marketingPresented" BOOLEAN;

-- The exact sentence beside the tick box, as rendered.
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "displayedLabel" TEXT;

-- Which market's notice was shown: NULL for the shared one, else the country
-- code. A code rather than an id, so the record still reads correctly if the
-- market is later removed.
ALTER TABLE "ConsentRecord" ADD COLUMN IF NOT EXISTS "noticeScope" TEXT;

-- Marketing is opted into from now on. Existing rows keep whatever they hold;
-- this only changes what a row created without an explicit value gets, and a
-- form that still holds the old default has marketing dropped from display
-- anyway when its tick box is required.
ALTER TABLE "Form" ALTER COLUMN "offerMarketingConsent" SET DEFAULT false;
