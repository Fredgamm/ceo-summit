-- AlterTable
-- Mot facultatif du destinataire en acceptant ou en refusant une demande de rendez-vous (module 21).
ALTER TABLE "MeetingBooking" ADD COLUMN "responseMessage" TEXT;
