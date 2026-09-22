-- 22 septembre 2026 (conception/12 §3) — "Je participe", supplément de
-- participants hors quota, cumul des places.

ALTER TABLE "Company" ADD COLUMN "adminParticipates" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Plan" ADD COLUMN "isUpsell" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CompanySubscription" ADD COLUMN "extraSeats" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CompanyPayment" ADD COLUMN "upsellPlanId" TEXT;
ALTER TABLE "CompanyPayment" ADD COLUMN "upsellQuantity" INTEGER;
ALTER TABLE "CompanyPayment"
  ADD CONSTRAINT "CompanyPayment_upsellPlanId_fkey"
  FOREIGN KEY ("upsellPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
