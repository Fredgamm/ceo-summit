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
 * Virement et chèque : preuve validée par l'admin. Carte et Mobile Money :
 * encaissés par Evolia (lib/evolia.ts), qui confirme par webhook.
 */
const companyPaymentMethodSchema = z.enum(
  ["VIREMENT", "CHEQUE", "CARTE_BANCAIRE", "MOBILE_MONEY"],
  {
    errorMap: () => ({ message: "Mode de paiement invalide." }),
  }
);

/**
 * Intégration Evolia (8 oct. 2026) — carte et Mobile Money sont encaissés par
 * Evolia, sans preuve ; virement et chèque gardent leur preuve obligatoire.
 */
function requireProofForManualMethods(
  data: { method: string; proofFileKey: string },
  ctx: z.RefinementCtx
) {
  const manual = data.method === "VIREMENT" || data.method === "CHEQUE";
  if (manual && !data.proofFileKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["proofFileKey"],
      message: "La preuve de paiement est requise",
    });
  }
}

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
export const submitPaymentProofSchema = z
  .object({
    method: companyPaymentMethodSchema,
    proofFileKey: z.string().optional().default(""),
    comment: z.string().trim().max(1000).optional().default(""),
    declaredParticipants: z.coerce.number().int().min(1).optional(),
  })
  .superRefine(requireProofForManualMethods);

/**
 * Audit (25 septembre 2026) — `CompanyPayment.amount` est un `Int`
 * (int4 PostgreSQL) : tout montant calculé au-delà est refusé avec un
 * message plutôt que de laisser Prisma échouer en 500. La quantité d'un
 * supplément est bornée pour la même raison (et par simple bon sens).
 */
export const MAX_PAYMENT_AMOUNT = 2_147_483_647;
export const MAX_UPSELL_QUANTITY = 500;

/**
 * 22 septembre 2026 (`conception/12` §3.2) — achat d'une offre supplément
 * (`Plan.isUpsell`) en quantité, en plus d'un abonnement déjà actif. Même
 * mécanique de preuve que `submitPaymentProofSchema`, plus la quantité —
 * le montant (`unitPriceAr × quantity`) reste calculé côté serveur.
 */
export const purchaseUpsellSeatsSchema = z
  .object({
    upsellPlanId: z.string().min(1),
    quantity: z.coerce
      .number()
      .int()
      .min(1, "Indiquez au moins 1")
      .max(MAX_UPSELL_QUANTITY, `Au plus ${MAX_UPSELL_QUANTITY} places par achat`),
    method: companyPaymentMethodSchema,
    proofFileKey: z.string().optional().default(""),
    comment: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine(requireProofForManualMethods);
