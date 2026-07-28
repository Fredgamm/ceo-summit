-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SUMMIT', 'DINER', 'WEBINAIRE', 'RENCONTRE');

-- CreateEnum
CREATE TYPE "EventPaymentMethod" AS ENUM ('VIREMENT', 'MOBILE_MONEY', 'INCLUS');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "type" "EventType" NOT NULL DEFAULT 'RENCONTRE';

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "paymentMethod" "EventPaymentMethod";

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

