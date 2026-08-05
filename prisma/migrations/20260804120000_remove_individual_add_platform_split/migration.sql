-- CreateEnum
CREATE TYPE "PlanPricingMode" AS ENUM ('PER_PARTICIPANT', 'FIXED_BUNDLE');

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_planId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipPayment" DROP CONSTRAINT "MembershipPayment_membershipId_fkey";

-- DropTable
DROP TABLE "MembershipPayment";

-- DropTable
DROP TABLE "Membership";

-- AlterEnum
BEGIN;
CREATE TYPE "MembershipStatus_new" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::text::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "MembershipStatus_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'PENDING_ACTIVATION';
COMMIT;

-- DropIndex
DROP INDEX "Plan_scope_isActive_displayOrder_idx";

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "scope",
ADD COLUMN     "includedSeats" INTEGER,
ADD COLUMN     "linkedPlatformPlanId" TEXT,
ADD COLUMN     "pricingMode" "PlanPricingMode";

-- DropEnum
DROP TYPE "PlanScope";

-- CreateIndex
CREATE INDEX "Plan_isActive_displayOrder_idx" ON "Plan"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "Plan_linkedPlatformPlanId_idx" ON "Plan"("linkedPlatformPlanId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_linkedPlatformPlanId_fkey" FOREIGN KEY ("linkedPlatformPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: preserve current per-participant billing behavior for
-- existing event-scoped offers (Phase 2quater), since pricingMode has no
-- default and would otherwise be left NULL on pre-existing rows.
UPDATE "Plan" SET "pricingMode" = 'PER_PARTICIPANT' WHERE "eventId" IS NOT NULL;
