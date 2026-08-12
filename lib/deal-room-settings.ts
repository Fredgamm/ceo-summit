import { prisma } from "@/lib/prisma";
import { DEAL_ROOM_CONTACT_COST_DEFAULT } from "@/lib/deal-room-query";

const CONTACT_COST_KEY = "deal_room_contact_cost";

/**
 * Coût en crédits Deal Room configurable (7 août 2026, demande admin) —
 * auparavant une constante fixe (`DEAL_ROOM_CONTACT_COST_DEFAULT`, toujours
 * utilisée comme valeur de repli tant qu'aucun admin ne l'a changée).
 * Stocké dans `PlatformSetting` (clé/valeur déjà existante dans le schéma,
 * jusqu'ici jamais réellement utilisée). 0 = contact gratuit pour tous les
 * membres (Chairman reste de toute façon toujours gratuit, indépendamment
 * de ce réglage).
 *
 * Fichier séparé de `lib/deal-room-query.ts` (pas de `prisma` là-bas) —
 * ce module importe Prisma, cette query lib est aussi importée par des
 * composants client (`opportunity-card.tsx`, `contact-panel.tsx`,
 * `publish-wizard.tsx`), qui ne doivent jamais embarquer le client Prisma.
 */
export async function getDealRoomContactCost(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: CONTACT_COST_KEY } });
  if (!row) return DEAL_ROOM_CONTACT_COST_DEFAULT;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed)
    : DEAL_ROOM_CONTACT_COST_DEFAULT;
}

export async function setDealRoomContactCost(cost: number): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key: CONTACT_COST_KEY },
    update: { value: String(cost) },
    create: { key: CONTACT_COST_KEY, value: String(cost) },
  });
}
