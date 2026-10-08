-- Module 21 (8 oct. 2026) : fuseau horaire par événement (D19) et
-- rendez-vous B2B en événement (conception/21).

-- CreateEnum
CREATE TYPE "MeetingSetupStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MeetingSlotStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MeetingAvailability" AS ENUM ('INACTIVE', 'FREE', 'PENDING', 'BOOKED');

-- CreateEnum
CREATE TYPE "MeetingBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'CANCELLED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Indian/Antananarivo';

-- Recalage des horaires existants (D19). Jusqu'ici, les saisies
-- datetime-local de l'admin (début et fin d'événement, sessions du
-- Programme) étaient interprétées à l'heure du serveur, UTC en production :
-- « 09:00 » saisi pour Madagascar était stocké 09:00 UTC, soit 3 h trop
-- tard. Désormais elles sont lues dans le fuseau de l'événement
-- (Madagascar, UTC+3, pour tous les événements existants) : on retire 3 h
-- pour que l'heure affichée reste celle saisie.
-- ⚠ Une base de développement tournant à l'heure de Madagascar stockait
-- déjà des instants corrects : y rajouter 3 h après la migration.
UPDATE "Event" SET "date" = "date" - INTERVAL '3 hours',
                   "endDate" = "endDate" - INTERVAL '3 hours';
UPDATE "EventSession" SET "startTime" = "startTime" - INTERVAL '3 hours',
                          "endTime" = "endTime" - INTERVAL '3 hours';

-- CreateTable
CREATE TABLE "EventMeetingSetup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "accessInstructions" TEXT NOT NULL,
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "MeetingSetupStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMeetingSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTimeSlot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "MeetingSlotStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingTimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipantSlot" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MeetingAvailability" NOT NULL DEFAULT 'FREE',
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingParticipantSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingBooking" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MeetingBookingStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "decisionTokenHash" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventMeetingSetup_eventId_key" ON "EventMeetingSetup"("eventId");

-- CreateIndex
CREATE INDEX "MeetingTimeSlot_eventId_status_startTime_idx" ON "MeetingTimeSlot"("eventId", "status", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingTimeSlot_eventId_startTime_key" ON "MeetingTimeSlot"("eventId", "startTime");

-- CreateIndex
CREATE INDEX "MeetingParticipantSlot_userId_status_idx" ON "MeetingParticipantSlot"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipantSlot_slotId_userId_key" ON "MeetingParticipantSlot"("slotId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingBooking_decisionTokenHash_key" ON "MeetingBooking"("decisionTokenHash");

-- CreateIndex
CREATE INDEX "MeetingBooking_eventId_status_idx" ON "MeetingBooking"("eventId", "status");

-- CreateIndex
CREATE INDEX "MeetingBooking_requesterId_status_idx" ON "MeetingBooking"("requesterId", "status");

-- CreateIndex
CREATE INDEX "MeetingBooking_recipientId_status_idx" ON "MeetingBooking"("recipientId", "status");

-- CreateIndex
CREATE INDEX "MeetingBooking_slotId_idx" ON "MeetingBooking"("slotId");

-- CreateIndex
CREATE INDEX "MeetingBooking_status_expiresAt_idx" ON "MeetingBooking"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "EventMeetingSetup" ADD CONSTRAINT "EventMeetingSetup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTimeSlot" ADD CONSTRAINT "MeetingTimeSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipantSlot" ADD CONSTRAINT "MeetingParticipantSlot_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "MeetingTimeSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipantSlot" ADD CONSTRAINT "MeetingParticipantSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "MeetingTimeSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RG-01 : pas de rendez-vous avec soi-même.
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_not_self_check" CHECK ("requesterId" <> "recipientId");

-- Un créneau finit après avoir commencé.
ALTER TABLE "MeetingTimeSlot" ADD CONSTRAINT "MeetingTimeSlot_end_after_start_check" CHECK ("endTime" > "startTime");
