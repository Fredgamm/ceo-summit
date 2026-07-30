-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN "consentedAt" TIMESTAMP(3);

-- Backfill existing rows (seed/demo data predating consent tracking) with
-- their creation date as the best available proxy.
UPDATE "MembershipApplication" SET "consentedAt" = "createdAt" WHERE "consentedAt" IS NULL;

-- AlterTable
ALTER TABLE "MembershipApplication" ALTER COLUMN "consentedAt" SET NOT NULL;
