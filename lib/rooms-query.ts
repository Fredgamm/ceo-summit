import type { Prisma, RoomAccessLevel, Tier } from "@prisma/client";

/** E4-T02 — pure filter logic for `/salles`, same rationale as lib/deal-room-query.ts. */

export const ROOM_ACCESS_LABEL: Record<RoomAccessLevel, string> = {
  ALL_MEMBERS: "Tous membres",
  EXECUTIVE_PLUS: "Executive & Chairman",
  CHAIRMAN_ONLY: "Chairman uniquement",
};

/**
 * Décision d'architecture (sept. 2026, conception/09) — accès égal pour tout
 * membre dont l'entreprise a une offre active/validée : ce n'est plus le
 * rang du viewer face à `minTier` qui compte, seulement la présence d'un
 * accès plateforme (`viewerTier` non nul signifie déjà "offre active ou
 * expirée mais encore valable pour les avantages plateforme", voir
 * getViewerTierFromCompany/RG-12). `minTier` reste au paramètre — et
 * `Room.minTier` reste en base — pour ne pas casser les appelants ni migrer
 * le schéma ; simplement plus lu comme un filtre.
 */
export function meetsRoomAccess(
  viewerTier: Tier | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so callers/signature don't change; see doc-comment above
  _minTier: RoomAccessLevel
): boolean {
  return viewerTier != null;
}

export interface RoomsSearchParams {
  secteur?: string;
  acces?: string;
}

/** Always scoped to ACTIVE rooms — archived rooms never appear in the member-facing list. */
export function buildRoomsWhere(
  params: RoomsSearchParams,
  validSectors: readonly string[]
): Prisma.RoomWhereInput {
  const where: Prisma.RoomWhereInput = { status: "ACTIVE" };

  if (params.secteur && validSectors.includes(params.secteur)) {
    where.sector = params.secteur;
  }
  if (params.acces && params.acces in ROOM_ACCESS_LABEL) {
    where.minTier = params.acces as RoomAccessLevel;
  }

  return where;
}
