import type { BroadcastSegment, Prisma } from "@prisma/client";

import { LEGACY_TIER_RANK } from "@/lib/plan-access";

/** E8-T09 — segmentation des destinataires d'un broadcast. */

/**
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — un destinataire
 * "actif" a une entreprise dont l'abonnement est ACTIVE ou EXPIRED (RG-12 :
 * seul l'accès à l'édition d'évènement expire, pas les avantages
 * plateforme — un broadcast reste pertinent pour ces membres).
 */
const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "EXPIRED"] as const;

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
   * Phase 1 offres dynamiques (30 juillet 2026) — cible une offre précise
   * (au-delà des 2 segments CHAIRMAN/EXECUTIVE fixes ci-dessus, gardés tels
   * quels pour compatibilité) via un vrai CUSTOM segment plutôt que
   * d'ajouter une valeur d'enum `BroadcastSegment` par plan créé.
   */
  planId?: string;
}

/**
 * "Membres actifs" = compte non suspendu/exclu ET entreprise à l'abonnement
 * actif (ou expiré, RG-12) — envoyer à un membre suspendu ou exclu serait
 * une erreur, pas juste une simplification.
 *
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — CHAIRMAN/EXECUTIVE ne
 * sont plus des tiers stockés par utilisateur : filtrés par seuil minimum
 * de rang de l'offre plateforme de l'entreprise (même sémantique >= que
 * partout ailleurs dans ce fichier, pas un bucket exact).
 */
export function buildBroadcastRecipientsWhere(
  segment: BroadcastSegment,
  custom: CustomSegmentParams = {}
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    status: "ACTIVE",
    company: { subscription: { status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } } },
  };

  if (segment === "CHAIRMAN") {
    where.company = {
      subscription: {
        status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
        plan: { rank: { gte: LEGACY_TIER_RANK.CHAIRMAN } },
      },
    };
  } else if (segment === "EXECUTIVE") {
    where.company = {
      subscription: {
        status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
        plan: { rank: { gte: LEGACY_TIER_RANK.EXECUTIVE } },
      },
    };
  } else if (segment === "CUSTOM") {
    if (custom.country) where.country = custom.country;
    if (custom.sector) where.sectors = { has: custom.sector };
    if (custom.planId) {
      where.company = {
        subscription: {
          status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
          planId: custom.planId,
        },
      };
    }
  }

  return where;
}
