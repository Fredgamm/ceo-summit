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
 * Paiement carte / Mobile Money abandonné (8 oct. 2026) : le gérant peut
 * l'annuler pour changer de mode de paiement, mais seulement après ce délai,
 * le temps qu'une confirmation d'Evolia déjà en route nous parvienne.
 */
export const EVOLIA_CANCEL_DELAY_MS = 15 * 60 * 1000;

/**
 * Motif réservé d'un paiement annulé par l'entreprise (et non refusé par
 * l'admin) : une confirmation tardive d'Evolia reste acceptée pour lui
 * (voir `reviveCancelledEvoliaPayment`), le membre ayant bien payé.
 */
export const CANCELLED_BY_COMPANY_REASON =
  "Annulé par l'entreprise — changement de mode de paiement.";
