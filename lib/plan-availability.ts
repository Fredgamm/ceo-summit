import { DEFAULT_EVENT_TIMEZONE, zonedDayKey, zonedLocalToUtc } from "@/lib/event-timezone";
import { formatDateFr } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

/**
 * 23 oct. 2026 — date limite de disponibilité d'une offre (`Plan.availableUntil`) :
 * Early Bird jusqu'au 31 décembre 2026, fin des ventes au 28 février 2027.
 * Passé cet instant, l'offre n'est plus proposée, ne peut plus être choisie
 * et ne peut plus être payée — y compris par une entreprise qui l'avait
 * choisie avant (elle doit en changer, ou l'admin repousse la date).
 *
 * L'admin saisit un jour ; l'offre reste disponible jusqu'à la fin de ce jour
 * dans le fuseau de son événement (Madagascar à défaut).
 */

interface PlanAvailabilityFields {
  name: string;
  availableUntil: Date | null;
}

export function isPlanAvailable(
  plan: { availableUntil: Date | null },
  now: Date = new Date()
): boolean {
  return !plan.availableUntil || now.getTime() <= plan.availableUntil.getTime();
}

/**
 * 23 oct. 2026 — une offre expirée reste payable par l'entreprise qui avait
 * déjà engagé un paiement pour son offre avant la date limite (virement refusé
 * pour une preuve illisible, carte annulée…) : elle a choisi et payé à temps.
 */
export async function subscriptionCanPayPlan(subscription: {
  id: string;
  plan: { availableUntil: Date | null };
}): Promise<boolean> {
  if (isPlanAvailable(subscription.plan)) return true;
  const engaged = await prisma.companyPayment.findFirst({
    where: {
      companySubscriptionId: subscription.id,
      upsellQuantity: null,
      createdAt: { lte: subscription.plan.availableUntil! },
    },
    select: { id: true },
  });
  return Boolean(engaged);
}

export function planUnavailableMessage(plan: PlanAvailabilityFields): string {
  const name = plan.name.replace(/\*+/g, "").trim();
  return plan.availableUntil
    ? `L'offre « ${name} » n'est plus disponible depuis le ${formatDateFr(plan.availableUntil)}. Choisissez une autre offre.`
    : `L'offre « ${name} » n'est plus disponible. Choisissez une autre offre.`;
}

/** « 2026-12-31 » saisi par l'admin → dernière minute de ce jour dans le fuseau. */
export function availableUntilFromDay(
  day: string | null | undefined,
  timeZone: string = DEFAULT_EVENT_TIMEZONE
): Date | null {
  if (!day) return null;
  const endOfDay = zonedLocalToUtc(`${day}T23:59`, timeZone);
  return endOfDay ? new Date(endOfDay.getTime() + 59_999) : null;
}

/** Valeur d'un `<input type="date">` pour une date limite enregistrée. */
export function availableUntilToDay(
  availableUntil: Date | null,
  timeZone: string = DEFAULT_EVENT_TIMEZONE
): string {
  return availableUntil ? zonedDayKey(availableUntil, timeZone) : "";
}
