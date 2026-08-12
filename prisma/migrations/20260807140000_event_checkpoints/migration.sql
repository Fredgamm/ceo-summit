-- Contrôle d'accès multi-points (7 août 2026, demande client 3ème édition)
-- — postes de scan distincts par évènement (ex. "Entrée VIP", "Entrée
-- Staff"), enregistrés sur chaque check-in pour le comptage/reporting.

-- CreateTable
CREATE TABLE "EventCheckpoint" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventCheckpoint_eventId_idx" ON "EventCheckpoint"("eventId");

-- AddForeignKey
ALTER TABLE "EventCheckpoint" ADD CONSTRAINT "EventCheckpoint_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN "checkpointId" TEXT;

-- CreateIndex
CREATE INDEX "EventRegistration_checkpointId_idx" ON "EventRegistration"("checkpointId");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "EventCheckpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
