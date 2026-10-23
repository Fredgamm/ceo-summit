import type { PaymentMethod } from "@prisma/client";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "VIREMENT", label: "Virement bancaire" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "CARTE_BANCAIRE", label: "Carte bancaire" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
];

/**
 * 3 septembre 2026 — carte bancaire et mobile money passeront par Evolia
 * (redirection, pas de preuve à uploader), mais ce pont n'est pas encore
 * construit côté Evolia (conception/11 §3, en attente de leur réponse) :
 * en attendant, ces deux méthodes restent sélectionnables mais ne mènent
 * à aucun parcours de paiement fonctionnel — seuls virement et chèque
 * (validation manuelle par preuve) sont opérationnels aujourd'hui. Même
 * règle partout où un mode de paiement se choisit (paiement initial,
 * supplément de places).
 */
export const EVOLIA_PAYMENT_METHODS: PaymentMethod[] = ["CARTE_BANCAIRE", "MOBILE_MONEY"];

export function isEvoliaPaymentMethod(method: PaymentMethod): boolean {
  return EVOLIA_PAYMENT_METHODS.includes(method);
}

/**
 * Motif réservé d'un paiement annulé par l'entreprise (et non refusé par
 * l'admin) : une confirmation tardive d'Evolia reste acceptée pour lui
 * (voir `reviveCancelledEvoliaPayment`), le membre ayant bien payé.
 */
export const CANCELLED_BY_COMPANY_REASON =
  "Annulé par l'entreprise — changement de mode de paiement.";

/**
 * 21 oct. 2026 — motif réservé d'un paiement qu'Evolia signale annulé ou
 * refusé (`payment.failed`). Même traitement qu'une annulation par
 * l'entreprise : une confirmation tardive reste honorée.
 */
export const FAILED_AT_EVOLIA_REASON = "Paiement annulé ou refusé chez Evolia.";

/**
 * Paiement annulé parce qu'Evolia n'a pas répondu à l'envoi de l'inscription
 * (startEvoliaCollection). Evolia a pu l'enregistrer malgré tout : si le
 * client paie, sa confirmation reste acceptée (23 oct. 2026).
 */
export const EVOLIA_PUSH_FAILED_REASON = "Transmission à Evolia impossible — paiement non lancé.";

/** Motifs de refus après lesquels une confirmation d'Evolia reste acceptée. */
export const REVIVABLE_EVOLIA_REASONS = [
  CANCELLED_BY_COMPANY_REASON,
  FAILED_AT_EVOLIA_REASON,
  EVOLIA_PUSH_FAILED_REASON,
];
