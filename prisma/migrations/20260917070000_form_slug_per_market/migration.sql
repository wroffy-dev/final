-- Form slugs become unique per market rather than globally.
--
-- A form already belongs to exactly one market, or to all of them. Making the
-- slug global meant the sync had to invent "contact-ae" for the UAE copy of
-- India's "contact" — a name nobody chose, in a URL nobody wanted.
--
-- Every existing slug is globally unique, so every current row already
-- satisfies the narrower constraint and nothing is renamed by this. What
-- changes is only what becomes possible from here.
--
-- Two forms shared by every market (countryId null) could now collide, because
-- SQL treats NULLs as distinct and a unique index cannot catch that. `saveForm`
-- checks it instead — the one case the database cannot express.
DROP INDEX IF EXISTS "Form_slug_key";
CREATE UNIQUE INDEX "Form_countryId_slug_key" ON "Form"("countryId", "slug");
