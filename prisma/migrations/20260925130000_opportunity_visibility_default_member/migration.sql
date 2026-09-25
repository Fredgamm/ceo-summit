-- Audit mobile 22 sept. 2026 (conception/14 §3) — aligne le défaut de
-- Opportunity.visibility sur Event.minTier/Room.minTier (déjà "tout le
-- monde" par défaut). N'affecte que les futures lignes créées sans valeur
-- explicite ; les lignes existantes ne sont pas modifiées.
ALTER TABLE "Opportunity" ALTER COLUMN "visibility" SET DEFAULT 'MEMBER';
