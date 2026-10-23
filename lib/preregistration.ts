import { prisma } from "@/lib/prisma";
import { DEFAULT_EVENT_TIMEZONE, zonedLocalToUtc } from "@/lib/event-timezone";

/**
 * 23 oct. 2026 — préinscription : tant que les paiements ne sont pas ouverts,
 * une entreprise crée son compte, choisit son offre et déclare son effectif,
 * sans payer. Rien ne part vers Evolia : il n'est appelé qu'au paiement
 * (lib/evolia.ts), et ses envois sont retenus tant qu'il n'est pas activé.
 *
 * Réglée dans /admin/parametres (onglet Tarifs & Règles) : un jour
 * d'ouverture, à minuit heure de Madagascar. Sans date, ou une fois la date
 * passée, le parcours de paiement normal s'applique.
 */

export const PREREGISTRATION_SETTING_KEYS = {
  paymentsOpenOn: "registration.payments_open_on",
  openEmailSentAt: "registration.open_email_sent_at",
} as const;

export interface PreregistrationStatus {
  /** Jour d'ouverture des paiements (« 2027-01-15 »), `null` = pas de préinscription. */
  paymentsOpenOn: string | null;
  paymentsOpenAt: Date | null;
  /** Les paiements sont encore fermés. */
  active: boolean;
  openEmailSentAt: Date | null;
}

export function paymentsOpenAtFromDay(day: string): Date | null {
  return zonedLocalToUtc(`${day}T00:00`, DEFAULT_EVENT_TIMEZONE);
}

export async function getPreregistrationStatus(
  now: Date = new Date()
): Promise<PreregistrationStatus> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(PREREGISTRATION_SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const paymentsOpenOn = byKey.get(PREREGISTRATION_SETTING_KEYS.paymentsOpenOn) || null;
  const paymentsOpenAt = paymentsOpenOn ? paymentsOpenAtFromDay(paymentsOpenOn) : null;
  const sentAt = byKey.get(PREREGISTRATION_SETTING_KEYS.openEmailSentAt);
  return {
    paymentsOpenOn,
    paymentsOpenAt,
    active: Boolean(paymentsOpenAt && now.getTime() < paymentsOpenAt.getTime()),
    openEmailSentAt: sentAt ? new Date(sentAt) : null,
  };
}

/**
 * Entreprises préinscrites : une offre choisie, rien de payé ni en cours de
 * vérification. Ce sont elles qui reçoivent l'e-mail d'ouverture des paiements.
 */
export const PREREGISTERED_SUBSCRIPTION_WHERE = {
  status: "PENDING_PAYMENT" as const,
};
