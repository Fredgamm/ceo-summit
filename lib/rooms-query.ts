import type { Prisma, RoomAccessLevel, Tier } from "@prisma/client";

import { SECTORS } from "@/lib/sectors";

/** E4-T02 — pure filter logic for `/salles`, same rationale as lib/deal-room-query.ts. */

const ACCESS_ORDER: RoomAccessLevel[] = ["ALL_MEMBERS", "EXECUTIVE_PLUS", "CHAIRMAN_ONLY"];
const TIER_RANK: Record<Tier, number> = { MEMBER: 0, EXECUTIVE: 1, CHAIRMAN: 2 };

export const ROOM_ACCESS_LABEL: Record<RoomAccessLevel, string> = {
  ALL_MEMBERS: "Tous membres",
  EXECUTIVE_PLUS: "Executive & Chairman",
  CHAIRMAN_ONLY: "Chairman uniquement",
};

/** Whether a member's tier satisfies a room's minimum access level. */
export function meetsRoomAccess(
  viewerTier: Tier | null | undefined,
  minTier: RoomAccessLevel
): boolean {
  if (!viewerTier) return false;
  return TIER_RANK[viewerTier] >= ACCESS_ORDER.indexOf(minTier);
}

export interface RoomsSearchParams {
  secteur?: string;
  acces?: string;
}

/** Always scoped to ACTIVE rooms — archived rooms never appear in the member-facing list. */
export function buildRoomsWhere(params: RoomsSearchParams): Prisma.RoomWhereInput {
  const where: Prisma.RoomWhereInput = { status: "ACTIVE" };

  if (params.secteur && (SECTORS as readonly string[]).includes(params.secteur)) {
    where.sector = params.secteur;
  }
  if (params.acces && ACCESS_ORDER.includes(params.acces as RoomAccessLevel)) {
    where.minTier = params.acces as RoomAccessLevel;
  }

  return where;
}
