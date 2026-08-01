-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MembershipStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "MembershipStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "Membership" ALTER COLUMN "tier" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "isSelfService" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minParticipants" INTEGER,
ADD COLUMN     "slug" TEXT;

-- Backfill slug for existing rows (Phase 0 legacy MEMBER/EXECUTIVE/CHAIRMAN
-- plans, or any admin-created plan already in place) before enforcing
-- NOT NULL + unique — slugified from name, deduplicated by appending the
-- row id when a collision would otherwise occur.
UPDATE "Plan"
SET "slug" = lower(regexp_replace(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '-+', '-', 'g'))
WHERE "slug" IS NULL;

UPDATE "Plan" AS p
SET "slug" = p."slug" || '-' || substr(p.id, 1, 6)
WHERE EXISTS (
  SELECT 1 FROM "Plan" AS p2
  WHERE p2."slug" = p."slug" AND p2.id <> p.id
);

ALTER TABLE "Plan" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "intendedPlanId" TEXT;

-- CreateTable
CREATE TABLE "MembershipPayment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "proofFileKey" TEXT NOT NULL,
    "comment" TEXT,
    "status" "PaymentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipPayment_status_idx" ON "MembershipPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_intendedPlanId_fkey" FOREIGN KEY ("intendedPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
