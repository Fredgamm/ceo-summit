-- 14 oct. 2026 : la confirmation de l'adresse e-mail devient obligatoire avant
-- paiement (lib/email-verification.ts). Les comptes existants n'ont jamais eu
-- ce lien : ils sont considérés comme confirmés à leur date de création, pour
-- ne bloquer personne en cours de parcours. Seules les nouvelles inscriptions
-- passent par la confirmation.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
