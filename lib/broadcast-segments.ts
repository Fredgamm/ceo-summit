import type { BroadcastSegment, Prisma } from "@prisma/client";

/** E8-T09 — segmentation des destinataires d'un broadcast. */

/**
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — un destinataire
 * "actif" a une entreprise dont l'abonnement est ACTIVE ou EXPIRED (RG-12 :
 * seul l'accès à l'édition d'évènement expire, pas les avantages
 * plateforme — un broadcast reste pertinent pour ces membres).
 */
const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "EXPIRED"] as const;

/** Segments encore proposés à l'envoi ; CHAIRMAN/EXECUTIVE ne restent que pour l'historique. */
export type SendableSegment = Extract<BroadcastSegment, "ALL_ACTIVE" | "CUSTOM">;

export const SEGMENT_LABEL: Record<BroadcastSegment, string> = {
  ALL_ACTIVE: "Tous les membres actifs",
  CHAIRMAN: "Chairman uniquement",
  EXECUTIVE: "Executive uniquement",
  CUSTOM: "Segment personnalisé",
};

export interface CustomSegmentParams {
  country?: string;
  sector?: string;
  /**
   * Phase 1 offres dynamiques (30 juillet 2026) — cible une ou plusieurs
   * offres précises via un vrai CUSTOM segment plutôt que d'ajouter une
   * valeur d'enum `BroadcastSegment` par plan créé.
   *
   * Rapport QA du 1er oct. 2026 (§3.2b) — passé de `planId` (une seule
   * offre) à `planIds` (plusieurs) : le client a demandé de pouvoir cibler
   * plusieurs offres à la fois, pas seulement une.
   */
  planIds?: string[];
}

/**
 * "Membres actifs" = compte non suspendu/exclu ET entreprise à l'abonnement
 * actif (ou expiré, RG-12) — envoyer à un membre suspendu ou exclu serait
 * une erreur, pas juste une simplification.
 */
export function buildBroadcastRecipientsWhere(
  segment: SendableSegment,
  custom: CustomSegmentParams = {}
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    status: "ACTIVE",
    company: { subscription: { status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } } },
  };

  if (segment === "CUSTOM") {
    if (custom.country) where.country = custom.country;
    if (custom.sector) where.sectors = { has: custom.sector };
    if (custom.planIds && custom.planIds.length > 0) {
      where.company = {
        subscription: {
          status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
          planId: { in: custom.planIds },
        },
      };
    }
  }

  return where;
}
