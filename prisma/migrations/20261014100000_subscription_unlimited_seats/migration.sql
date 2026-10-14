-- 14 oct. 2026 : offre « Staff » d'un administrateur de la plateforme,
-- sans limite du nombre de participants (voir lib/company-seats.ts::seatCap).

-- AlterTable
ALTER TABLE "CompanySubscription" ADD COLUMN "unlimitedSeats" BOOLEAN NOT NULL DEFAULT false;
