-- AlterEnum
ALTER TYPE "PlanPricingMode" ADD VALUE 'TIERED_GROUP';

-- CreateTable
CREATE TABLE "PlanPriceBracket" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "minParticipants" INTEGER NOT NULL,
    "maxParticipants" INTEGER,
    "unitPriceAr" INTEGER NOT NULL,
    "unitPriceEur" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPriceBracket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanPriceBracket_planId_idx" ON "PlanPriceBracket"("planId");

-- AddForeignKey
ALTER TABLE "PlanPriceBracket" ADD CONSTRAINT "PlanPriceBracket_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
