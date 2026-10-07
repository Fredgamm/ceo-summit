import type { AdminRole } from "@prisma/client";

/**
 * E8-T01 — "RBAC granulaire par section (ex: financier ne voit pas Paramètres)".
 * Section identifiers match AdminSidebar's nav items and, eventually, each
 * /admin/* route's own server-side check — this is the single source of
 * truth for both.
 */
export const ADMIN_SECTIONS = [
  "dashboard",
  "membres",
  "evenements",
  "deal-room",
  "salles",
  "services",
  "communications",
  "emails",
  "finances",
  "parametres",
  "plans",
  "entreprises",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

const SECTION_ACCESS: Record<AdminRole, "*" | AdminSection[]> = {
  SUPER_ADMIN: "*",
  MODERATEUR: [
    "dashboard",
    "membres",
    "evenements",
    "deal-room",
    "salles",
    "services",
    "communications",
    // Bibliothèque d'emails (25 septembre 2026) — même famille que
    // "communications" (textes destinés aux membres), pas la config
    // financière ; MODERATEUR gère déjà les broadcasts.
    "emails",
  ],
  // Tarification/paiement — même famille que "finances", pas
  // "parametres" (référentiels, comptes admin) qui reste réservé SUPER_ADMIN.
  FINANCIER: ["dashboard", "finances", "plans", "entreprises"],
};

export function canAccessSection(role: AdminRole, section: AdminSection): boolean {
  const allowed = SECTION_ACCESS[role];
  return allowed === "*" || allowed.includes(section);
}

export function accessibleSections(role: AdminRole): AdminSection[] {
  const allowed = SECTION_ACCESS[role];
  return allowed === "*" ? [...ADMIN_SECTIONS] : allowed;
}
