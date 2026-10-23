-- 23 oct. 2026 — date limite de disponibilité d'une offre (lib/plan-availability.ts).
ALTER TABLE "Plan" ADD COLUMN "availableUntil" TIMESTAMP(3);
