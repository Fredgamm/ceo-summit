-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "planId" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE INDEX "EventRegistration_planId_idx" ON "EventRegistration"("planId");

-- CreateIndex
CREATE INDEX "Plan_eventId_idx" ON "Plan"("eventId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
