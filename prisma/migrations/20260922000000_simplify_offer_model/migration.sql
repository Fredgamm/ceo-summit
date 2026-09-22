-- Audit du 22 septembre 2026 (conception/12) — simplification du modèle d'offre.

-- 1. `includedSeats` faisait doublon avec `maxTeamMembers` : on reporte la
--    valeur là où elle manque, puis on supprime la colonne.
UPDATE "Plan"
SET "maxTeamMembers" = "includedSeats"
WHERE "includedSeats" IS NOT NULL AND "maxTeamMembers" IS NULL;

ALTER TABLE "Plan" DROP COLUMN "includedSeats";

-- 2. `TIERED_GROUP` (14 septembre 2026) n'a jamais été utilisé par aucune
--    offre : on retire les paliers puis la valeur d'enum. PostgreSQL ne sait
--    pas supprimer une valeur d'enum, d'où la recréation du type.
DROP TABLE "PlanPriceBracket";

ALTER TYPE "PlanPricingMode" RENAME TO "PlanPricingMode_old";
CREATE TYPE "PlanPricingMode" AS ENUM ('PER_PARTICIPANT', 'FIXED_BUNDLE');
ALTER TABLE "Plan"
  ALTER COLUMN "pricingMode" TYPE "PlanPricingMode"
  USING ("pricingMode"::text::"PlanPricingMode");
DROP TYPE "PlanPricingMode_old";
