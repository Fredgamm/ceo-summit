-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "minPlanId" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "visibilityPlanId" TEXT;

-- CreateIndex
CREATE INDEX "Event_minPlanId_idx" ON "Event"("minPlanId");

-- CreateIndex
CREATE INDEX "Opportunity_visibilityPlanId_idx" ON "Opportunity"("visibilityPlanId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_minPlanId_fkey" FOREIGN KEY ("minPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_visibilityPlanId_fkey" FOREIGN KEY ("visibilityPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

