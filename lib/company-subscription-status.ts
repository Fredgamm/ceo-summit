/**
 * RG-12 (4 août 2026, split plateforme/évènement) — une souscription liée
 * à une offre d'évènement (`Plan.eventId` non nul) passe de `ACTIVE` à
 * `EXPIRED` une fois la date de l'évènement dépassée : seul l'accès à
 * *cette édition* expire, pas les avantages plateforme (crédits, Deal
 * Room — voir lib/plan-access.ts::getViewerTierFromCompany, qui traite
 * ACTIVE et EXPIRED comme équivalents). Calculé à la lecture, pas de job
 * planifié : fonction pure ici, la persistance du changement de statut
 * (nécessaire pour débloquer selectPlan) se fait au point d'usage.
 */
export function computeEffectiveStatus<T extends string>(
  status: T,
  eventDate: Date | null | undefined,
  now: Date = new Date()
): T | "EXPIRED" {
  if ((status as string) === "ACTIVE" && eventDate && eventDate < now) {
    return "EXPIRED";
  }
  return status;
}
