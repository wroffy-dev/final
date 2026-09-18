-- CreateEnum
CREATE TYPE "LawfulBasis" AS ENUM ('CONSENT', 'CONTRACT', 'LEGITIMATE_INTEREST', 'LEGAL_OBLIGATION');

-- CreateEnum
CREATE TYPE "ConsentEventType" AS ENUM ('GRANTED', 'WITHDRAWN', 'REINSTATED');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('ENQUIRY', 'MARKETING', 'TERMS', 'ALL');

-- CreateEnum
CREATE TYPE "IpStatus" AS ENUM ('RECORDED', 'UNAVAILABLE', 'UNTRUSTED', 'PURGED');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('ADD_MISSING', 'UPDATE_EXISTING');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Country" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CountrySettings" ADD COLUMN     "excludeFromSitemap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noIndexCountry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "robotsAllow" TEXT,
ADD COLUMN     "robotsDisallow" TEXT;

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "collectsPersonalData" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "consentNoticeKey" TEXT,
ADD COLUMN     "lawfulBasis" "LawfulBasis" NOT NULL DEFAULT 'CONSENT',
ADD COLUMN     "offerMarketingConsent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireTermsAcceptance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "fieldLabels" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "formName" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "ipStatus" "IpStatus" NOT NULL DEFAULT 'UNAVAILABLE';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "ipStatus" "IpStatus" NOT NULL DEFAULT 'UNAVAILABLE',
ADD COLUMN     "marketingSuppressedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConsentNotice" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "countryId" TEXT,
    "purposeText" TEXT NOT NULL,
    "enquiryLabel" TEXT NOT NULL,
    "marketingLabel" TEXT NOT NULL,
    "termsLabel" TEXT NOT NULL,
    "withdrawalText" TEXT NOT NULL,
    "privacyUrl" TEXT NOT NULL,
    "privacyVersion" TEXT,
    "termsUrl" TEXT NOT NULL,
    "termsVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ConsentNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "submissionId" TEXT,
    "countryId" TEXT,
    "noticeId" TEXT,
    "noticeKey" TEXT NOT NULL,
    "noticeVersion" INTEGER NOT NULL,
    "noticeSnapshot" JSONB NOT NULL,
    "purposeText" TEXT NOT NULL,
    "lawfulBasis" "LawfulBasis" NOT NULL DEFAULT 'CONSENT',
    "enquiryConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "termsRequired" BOOLEAN NOT NULL DEFAULT false,
    "privacyUrl" TEXT NOT NULL,
    "privacyVersion" TEXT,
    "termsUrl" TEXT NOT NULL,
    "termsVersion" TEXT,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnScope" "ConsentScope",

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "type" "ConsentEventType" NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "value" BOOLEAN NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'VISITOR',
    "note" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountrySyncMapping" (
    "id" TEXT NOT NULL,
    "sourceCountryId" TEXT NOT NULL,
    "targetCountryId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "targetSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountrySyncMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountrySyncRun" (
    "id" TEXT NOT NULL,
    "sourceCountryId" TEXT NOT NULL,
    "targetCountryId" TEXT NOT NULL,
    "mode" "SyncMode" NOT NULL DEFAULT 'ADD_MISSING',
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "previewOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "log" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CountrySyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentNotice_key_isCurrent_idx" ON "ConsentNotice"("key", "isCurrent");

-- CreateIndex
CREATE INDEX "ConsentNotice_countryId_idx" ON "ConsentNotice"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentNotice_key_version_key" ON "ConsentNotice"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_submissionId_key" ON "ConsentRecord"("submissionId");

-- CreateIndex
CREATE INDEX "ConsentRecord_leadId_idx" ON "ConsentRecord"("leadId");

-- CreateIndex
CREATE INDEX "ConsentRecord_countryId_consentedAt_idx" ON "ConsentRecord"("countryId", "consentedAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_marketingConsent_withdrawnAt_idx" ON "ConsentRecord"("marketingConsent", "withdrawnAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_recordId_createdAt_idx" ON "ConsentEvent"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "CountrySyncMapping_targetCountryId_entityType_idx" ON "CountrySyncMapping"("targetCountryId", "entityType");

-- CreateIndex
CREATE INDEX "CountrySyncMapping_sourceCountryId_idx" ON "CountrySyncMapping"("sourceCountryId");

-- CreateIndex
CREATE UNIQUE INDEX "CountrySyncMapping_targetCountryId_entityType_sourceId_key" ON "CountrySyncMapping"("targetCountryId", "entityType", "sourceId");

-- CreateIndex
CREATE INDEX "CountrySyncRun_targetCountryId_startedAt_idx" ON "CountrySyncRun"("targetCountryId", "startedAt");

-- CreateIndex
CREATE INDEX "CountrySyncRun_status_idx" ON "CountrySyncRun"("status");

-- CreateIndex
CREATE INDEX "Country_isActive_isPublished_idx" ON "Country"("isActive", "isPublished");

-- AddForeignKey
ALTER TABLE "ConsentNotice" ADD CONSTRAINT "ConsentNotice_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentNotice" ADD CONSTRAINT "ConsentNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "ConsentNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConsentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountrySyncMapping" ADD CONSTRAINT "CountrySyncMapping_sourceCountryId_fkey" FOREIGN KEY ("sourceCountryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountrySyncMapping" ADD CONSTRAINT "CountrySyncMapping_targetCountryId_fkey" FOREIGN KEY ("targetCountryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountrySyncRun" ADD CONSTRAINT "CountrySyncRun_sourceCountryId_fkey" FOREIGN KEY ("sourceCountryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountrySyncRun" ADD CONSTRAINT "CountrySyncRun_targetCountryId_fkey" FOREIGN KEY ("targetCountryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountrySyncRun" ADD CONSTRAINT "CountrySyncRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
