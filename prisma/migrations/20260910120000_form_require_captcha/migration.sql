-- Adds the opt-in math CAPTCHA flag to forms.
-- Additive and defaulted, so every existing form keeps working untouched.
ALTER TABLE "Form" ADD COLUMN IF NOT EXISTS "requireCaptcha" BOOLEAN NOT NULL DEFAULT false;
