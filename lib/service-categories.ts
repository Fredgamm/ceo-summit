/**
 * E5-T01 — canonical service category list for the services catalogue
 * (distinct from lib/sectors.ts, which is the member/opportunity industry
 * sector list). No admin-editable référentiel yet (that's E8-T11) — this is
 * the single source of truth until then, same rationale as lib/sectors.ts.
 */
export const SERVICE_CATEGORIES = [
  "Conseil & Stratégie",
  "Juridique & Fiscal",
  "Comptabilité & Finance",
  "Marketing & Communication",
  "Ressources Humaines",
  "Technologie & IT",
  "Logistique & Transport",
  "Ingénierie & BTP",
  "Formation",
  "Autre",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
