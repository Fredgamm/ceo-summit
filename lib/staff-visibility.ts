import { prisma } from "@/lib/prisma";

/**
 * 23 oct. 2026 — le staff (équipes CEO Summit et BECOM) apparaît-il dans
 * l'annuaire des membres et les « Nouveaux membres » du tableau de bord ?
 * Réglé dans Admin › Paramètres (onglet Tarifs & Règles). Masqué par défaut.
 */
export const SHOW_STAFF_SETTING_KEY = "directory.show_staff";

export async function getShowStaffInDirectory(): Promise<boolean> {
  const row = await prisma.platformSetting.findUnique({ where: { key: SHOW_STAFF_SETTING_KEY } });
  return row?.value === "true";
}
