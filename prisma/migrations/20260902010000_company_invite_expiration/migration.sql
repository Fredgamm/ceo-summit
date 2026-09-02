-- AlterTable
ALTER TABLE "CompanyInvite" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Backfill existing rows (audit du 7 août — invitations sans expiration
-- jusqu'ici) : 7 jours après leur création, même TTL que les nouvelles.
UPDATE "CompanyInvite" SET "expiresAt" = "createdAt" + INTERVAL '7 days' WHERE "expiresAt" IS NULL;

ALTER TABLE "CompanyInvite" ALTER COLUMN "expiresAt" SET NOT NULL;
