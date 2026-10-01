-- Rapport QA du 1er octobre 2026 (§3.2a) — clés R2 privées des pièces
-- jointes d'un broadcast, résolues en lien signé à l'envoi.
ALTER TABLE "Broadcast" ADD COLUMN "attachmentKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
