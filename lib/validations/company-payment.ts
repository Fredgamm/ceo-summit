import { z } from "zod";

/** Phase 2 offres/paiement (30 juillet 2026) — preuve de paiement entreprise. */
export const COMPANY_PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/**
 * Phase 2ter (1er août 2026) — `amount` retiré : le montant est désormais
 * toujours calculé côté serveur, jamais saisi par l'utilisateur.
 *
 * 4 août 2026 (RG-04) — `declaredParticipants` : pour une offre
 * `PER_PARTICIPANT`, l'entreprise déclare son nombre de participants prévu
 * (source de vérité du montant, pas le headcount réel) ; sans objet pour
 * une offre `FIXED_BUNDLE` (le nombre de sièges vient de l'offre
 * elle-même). Validé conditionnellement dans submitPaymentProof, pas ici
 * (dépend du pricingMode du plan, pas connu du schéma).
 */
export const submitPaymentProofSchema = z.object({
  method: z.enum(["VIREMENT", "CHEQUE", "CARTE_BANCAIRE", "MOBILE_MONEY"]),
  proofFileKey: z.string().min(1, "La preuve de paiement est requise"),
  comment: z.string().trim().max(1000).optional().default(""),
  declaredParticipants: z.coerce.number().int().min(1).optional(),
});

/**
 * 22 septembre 2026 (`conception/12` §3.2) — achat d'une offre supplément
 * (`Plan.isUpsell`) en quantité, en plus d'un abonnement déjà actif. Même
 * mécanique de preuve que `submitPaymentProofSchema`, plus la quantité —
 * le montant (`unitPriceAr × quantity`) reste calculé côté serveur.
 */
export const purchaseUpsellSeatsSchema = z.object({
  upsellPlanId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Indiquez au moins 1"),
  method: z.enum(["VIREMENT", "CHEQUE", "CARTE_BANCAIRE", "MOBILE_MONEY"]),
  proofFileKey: z.string().min(1, "La preuve de paiement est requise"),
  comment: z.string().trim().max(1000).optional().default(""),
});
