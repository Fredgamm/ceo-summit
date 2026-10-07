import { z } from "zod";

/**
 * Webhook paiement générique (7 août 2026) — volontairement agnostique du
 * prestataire (aucun choisi à ce stade — Evolia, Ticketplace, ou autre) :
 * un seul contrat minimal, à adapter uniquement dans la route elle-même
 * (mapping des champs propres au prestataire réel vers cette forme) le
 * jour où un prestataire est branché. Ne remplace jamais la validation
 * manuelle admin (`confirmCompanyPayment`/`confirmEventPayment`, tous deux
 * encore accessibles) — ce webhook n'est
 * qu'un chemin de confirmation automatique en plus, pour les prestataires
 * qui l'offrent.
 *
 * `reference` = l'id de notre propre enregistrement (CompanyPayment /
 * EventRegistration selon `type`), que le prestataire doit
 * nous renvoyer tel quel — à transmettre lors de l'initiation du paiement
 * chez lui (mécanisme d'initiation lui-même hors périmètre : aujourd'hui
 * aucun paiement n'est initié via une API externe, l'utilisateur paie hors
 * plateforme puis y revient).
 */
export const paymentWebhookSchema = z.object({
  event: z.enum(["payment.confirmed", "payment.failed"]),
  type: z.enum(["company_payment", "event_registration"]),
  reference: z.string().min(1),
  amount: z.number().positive().optional(),
});

export type PaymentWebhookPayload = z.infer<typeof paymentWebhookSchema>;
