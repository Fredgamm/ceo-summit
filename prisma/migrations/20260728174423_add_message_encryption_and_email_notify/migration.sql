/*
  Warnings:

  - Changed the type of `content` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- E7-T02 — "Chiffrement au repos (pgcrypto)"
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastEmailNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "content",
ADD COLUMN     "content" BYTEA NOT NULL;
