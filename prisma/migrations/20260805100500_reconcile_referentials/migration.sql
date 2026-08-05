-- E8-T11 (5 août 2026) — les référentiels "sector"/"country" seedés
-- initialement avaient été saisis indépendamment de lib/sectors.ts /
-- lib/countries.ts (vocabulaire différent : "Finance & Investissement" vs
-- "Finance & Banque", "Maurice" vs "Île Maurice", etc.) — un vrai décalage,
-- pas une variante. Migrer les filtres/formulaires vers ce référentiel sans
-- d'abord le réaligner aurait silencieusement changé le vocabulaire déjà en
-- usage dans les données existantes (Company.sector, Opportunity.sector...).
-- On réaligne donc le référentiel sur le vocabulaire réellement en usage,
-- pas l'inverse. Le libellé "Appel d'offres" (opportunity_type) est aussi
-- corrigé en "Appel à offres" pour matcher l'affichage historique
-- (ex-OPPORTUNITY_TYPE_LABEL.APPEL_OFFRES, voir migration précédente).
DELETE FROM "Referential" WHERE "type" IN ('sector', 'country', 'opportunity_type');

INSERT INTO "Referential" ("id", "type", "label", "position") VALUES
  (gen_random_uuid()::text, 'sector', 'Énergie & Environnement', 0),
  (gen_random_uuid()::text, 'sector', 'Finance & Banque', 1),
  (gen_random_uuid()::text, 'sector', 'Technologie & Digital', 2),
  (gen_random_uuid()::text, 'sector', 'Agroalimentaire & Agriculture', 3),
  (gen_random_uuid()::text, 'sector', 'Logistique & Transport', 4),
  (gen_random_uuid()::text, 'sector', 'Immobilier & BTP', 5),
  (gen_random_uuid()::text, 'sector', 'Santé & Pharmaceutique', 6),
  (gen_random_uuid()::text, 'sector', 'Tourisme & Hôtellerie', 7),
  (gen_random_uuid()::text, 'sector', 'Industrie & Manufacturing', 8),
  (gen_random_uuid()::text, 'sector', 'Autre', 9),
  (gen_random_uuid()::text, 'country', 'Madagascar', 0),
  (gen_random_uuid()::text, 'country', 'Île Maurice', 1),
  (gen_random_uuid()::text, 'country', 'La Réunion', 2),
  (gen_random_uuid()::text, 'country', 'Comores', 3),
  (gen_random_uuid()::text, 'country', 'Mayotte', 4),
  (gen_random_uuid()::text, 'country', 'Seychelles', 5),
  (gen_random_uuid()::text, 'country', 'Autre', 6),
  (gen_random_uuid()::text, 'opportunity_type', 'Partenariat', 0),
  (gen_random_uuid()::text, 'opportunity_type', 'Investissement', 1),
  (gen_random_uuid()::text, 'opportunity_type', 'Appel à offres', 2),
  (gen_random_uuid()::text, 'opportunity_type', 'Levée de fonds', 3),
  (gen_random_uuid()::text, 'opportunity_type', 'Joint-venture', 4);
