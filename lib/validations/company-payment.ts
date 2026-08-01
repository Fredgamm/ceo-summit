import { z } from "zod";

/** Phase 2 offres/paiement (30 juillet 2026) — preuve de paiement entreprise. */
export const COMPANY_PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const COMPANY_PAYMENT_PROOF_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export const submitPaymentProofSchema = z.object({
  amount: z.coerce.number().int().min(1, "Le montant doit être positif"),
  method: z.enum(["VIREMENT", "CHEQUE", "CARTE_BANCAIRE", "MOBILE_MONEY"]),
  proofFileKey: z.string().min(1, "La preuve de paiement est requise"),
  comment: z.string().trim().max(1000).optional().default(""),
});
