-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FormFieldType" ADD VALUE 'MULTISELECT';
ALTER TYPE "FormFieldType" ADD VALUE 'TIME';

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "design" JSONB;

-- AlterTable
ALTER TABLE "FormField" ADD COLUMN     "colSpan" INTEGER,
ADD COLUMN     "cssClass" TEXT,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "showLabel" BOOLEAN NOT NULL DEFAULT true;
