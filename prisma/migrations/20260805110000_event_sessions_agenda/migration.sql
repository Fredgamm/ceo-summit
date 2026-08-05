-- E10 (5 août 2026) — agenda dynamique multi-salles : remplace le champ
-- libre Event.program (JSON {jour, lignes}) par des sessions structurées
-- avec horaire et salle/piste. Aucune donnée réelle en dépendait au-delà
-- du seed de démo (reconstruit en EventSession dans prisma/seed.ts).
ALTER TABLE "Event" DROP COLUMN "program";

-- CreateTable
CREATE TABLE "EventSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "room" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "speakers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSession_eventId_startTime_idx" ON "EventSession"("eventId", "startTime");

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
