-- Correctif (7 août 2026, audit) — User.planId n'a plus jamais été écrit
-- depuis la bascule Tier->Plan (4 août 2026) : confirmé qu'aucun code du
-- projet ne le lit ni ne l'écrit avant de le supprimer. Ne pas confondre
-- avec User.intendedPlanId (actif, conservé).

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_planId_fkey";

-- DropIndex
DROP INDEX "User_planId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "planId";
