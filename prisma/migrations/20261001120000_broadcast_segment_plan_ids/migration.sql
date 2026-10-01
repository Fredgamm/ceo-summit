-- Rapport QA du 1er octobre 2026 (§3.2b) — trace les offres ciblées pour un
-- broadcast CUSTOM (plusieurs offres possibles, retrait des segments
-- CHAIRMAN/EXECUTIVE de l'UI). Vide par défaut pour l'historique existant.
ALTER TABLE "Broadcast" ADD COLUMN "segmentPlanIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
