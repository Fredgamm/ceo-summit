-- Intégration Evolia (conception/11) : journal des envois et validation de la liste des participants.
CREATE TYPE "EvoliaPushStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "CompanySubscription" ADD COLUMN "participantsValidatedAt" TIMESTAMP(3);

CREATE TABLE "EvoliaPush" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "reference" TEXT,
    "payload" JSONB NOT NULL,
    "status" "EvoliaPushStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvoliaPush_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvoliaPush_status_createdAt_idx" ON "EvoliaPush"("status", "createdAt");
CREATE INDEX "EvoliaPush_companyId_idx" ON "EvoliaPush"("companyId");
