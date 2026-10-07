-- Module 20 (offres partenaires) : invitations partenaires, nombre de membres et contrepartie par abonnement.
-- CreateEnum
CREATE TYPE "PartnerInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- AlterTable
ALTER TABLE "CompanySubscription" ADD COLUMN     "counterpart" TEXT,
ADD COLUMN     "memberLimit" INTEGER;

-- CreateTable
CREATE TABLE "PartnerInvite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "memberLimit" INTEGER,
    "counterpart" TEXT,
    "token" TEXT NOT NULL,
    "status" "PartnerInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerInvite_token_key" ON "PartnerInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerInvite_companyId_key" ON "PartnerInvite"("companyId");

-- CreateIndex
CREATE INDEX "PartnerInvite_status_idx" ON "PartnerInvite"("status");

-- CreateIndex
CREATE INDEX "PartnerInvite_email_idx" ON "PartnerInvite"("email");

-- AddForeignKey
ALTER TABLE "PartnerInvite" ADD CONSTRAINT "PartnerInvite_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerInvite" ADD CONSTRAINT "PartnerInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

