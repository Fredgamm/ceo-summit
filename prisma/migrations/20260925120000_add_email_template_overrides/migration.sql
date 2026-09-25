-- CreateEnum
CREATE TYPE "EmailTemplateCategory" AS ENUM ('ACCOUNT_APPLICATION', 'COMPANY_BILLING', 'TEAM_COLLABORATORS', 'EVENT', 'DEAL_ROOM', 'ROOM_MODERATION', 'SERVICES', 'MESSAGING', 'ADMIN_ALERT');

-- CreateTable
CREATE TABLE "EmailTemplateOverride" (
    "key" TEXT NOT NULL,
    "category" "EmailTemplateCategory" NOT NULL,
    "subject" TEXT,
    "blocks" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateOverride_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "EmailTemplateOverride_category_idx" ON "EmailTemplateOverride"("category");
