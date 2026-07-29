import type { BroadcastSegment, Prisma } from "@prisma/client";

/** E8-T09 — segmentation des destinataires d'un broadcast. */

export const SEGMENT_LABEL: Record<BroadcastSegment, string> = {
  ALL_ACTIVE: "Tous les membres actifs",
  CHAIRMAN: "Chairman uniquement",
  EXECUTIVE: "Executive uniquement",
  CUSTOM: "Segment personnalisé",
};

export interface CustomSegmentParams {
  country?: string;
  sector?: string;
}

/**
 * "Membres actifs" = compte non suspendu/exclu ET adhésion active — envoyer
 * à un membre suspendu ou exclu serait une erreur, pas juste une simplification.
 */
export function buildBroadcastRecipientsWhere(
  segment: BroadcastSegment,
  custom: CustomSegmentParams = {}
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    status: "ACTIVE",
    memberships: { some: { status: "ACTIVE" } },
  };

  if (segment === "CHAIRMAN") {
    where.memberships = { some: { status: "ACTIVE", tier: "CHAIRMAN" } };
  } else if (segment === "EXECUTIVE") {
    where.memberships = { some: { status: "ACTIVE", tier: "EXECUTIVE" } };
  } else if (segment === "CUSTOM") {
    if (custom.country) where.country = custom.country;
    if (custom.sector) where.sectors = { has: custom.sector };
  }

  return where;
}
