/**
 * Canonical sector list — matches the dropdown already used in
 * wireframe/demande-acces.html so onboarding, candidature and catalogue
 * filters all speak the same vocabulary. No admin-editable référentiel yet
 * (that's E8-T11) — this is the single source of truth until then.
 */
export const SECTORS = [
  "Énergie & Environnement",
  "Finance & Banque",
  "Technologie & Digital",
  "Agroalimentaire & Agriculture",
  "Logistique & Transport",
  "Immobilier & BTP",
  "Santé & Pharmaceutique",
  "Tourisme & Hôtellerie",
  "Industrie & Manufacturing",
  "Autre",
] as const;

export type Sector = (typeof SECTORS)[number];
