-- E8-T11 (5 août 2026) — Opportunity.type passe de l'enum OpportunityType à
-- une chaîne libre validée contre Referential(type: "opportunity_type"),
-- comme sector/country. Les valeurs existantes (codes SCREAMING_CASE) sont
-- converties vers leur libellé français affiché (OPPORTUNITY_TYPE_LABEL),
-- qui devient directement la valeur stockée — pas de perte de données.
ALTER TABLE "Opportunity" ALTER COLUMN "type" TYPE TEXT USING (
  CASE "type"::text
    WHEN 'PARTENARIAT' THEN 'Partenariat'
    WHEN 'INVESTISSEMENT' THEN 'Investissement'
    WHEN 'APPEL_OFFRES' THEN 'Appel à offres'
    WHEN 'LEVEE_FONDS' THEN 'Levée de fonds'
    WHEN 'JOINT_VENTURE' THEN 'Joint-venture'
    ELSE "type"::text
  END
);

DROP TYPE "OpportunityType";
