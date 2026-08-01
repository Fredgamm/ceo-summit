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
 * toujours calculé côté serveur (prix unitaire de l'offre × nombre réel de
 * participants, 1 pour une adhésion individuelle), jamais saisi par
 * l'utilisateur. Réutilisé tel quel pour les adhésions individuelles
 * (aucun champ propre à l'entreprise ici).
 */
export const submitPaymentProofSchema = z.object({
  method: z.enum(["VIREMENT", "CHEQUE", "CARTE_BANCAIRE", "MOBILE_MONEY"]),
  proofFileKey: z.string().min(1, "La preuve de paiement est requise"),
  comment: z.string().trim().max(1000).optional().default(""),
});
