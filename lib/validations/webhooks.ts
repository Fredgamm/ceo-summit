import { z } from "zod";

/**
 * Evolia webhook payload — shape as documented in
 * CEO_Summit_Architecture_Technique.docx §Webhooks & intégrations.
 * "À documenter en Phase 0 : payload exact..." — this schema is our best-effort
 * contract from the architecture doc; confirm against the real sandbox payload
 * once Evolia grants API access (RG-P0-04) and adjust field names if they differ.
 */
export const evoliaWebhookSchema = z.object({
  event: z.enum(["payment.confirmed", "payment.failed", "payment.refunded"]),
  member: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  subscription: z.object({
    tier: z.enum(["member", "executive", "chairman"]),
    startDate: z.string().datetime().or(z.string()), // Evolia date format TBD — accept ISO or plain string
    endDate: z.string().datetime().or(z.string()),
  }),
  payment: z.object({
    amount: z.number().positive(),
    reference: z.string().min(1),
    date: z.string(),
  }),
});

export type EvoliaWebhookPayload = z.infer<typeof evoliaWebhookSchema>;

/**
 * Resend webhook payload (E8-T09 — "taux d'ouverture"). Real shape per
 * https://resend.com/docs/dashboard/webhooks/event-types — only `email.opened`
 * is acted on here, the rest are accepted and logged for completeness.
 */
export const resendWebhookSchema = z.object({
  type: z.enum([
    "email.sent",
    "email.delivered",
    "email.delivery_delayed",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
  ]),
  created_at: z.string(),
  data: z.object({ email_id: z.string() }).passthrough(),
});

export type ResendWebhookPayload = z.infer<typeof resendWebhookSchema>;

/**
 * Webhook paiement générique (7 août 2026) — volontairement agnostique du
 * prestataire (aucun choisi à ce stade — Evolia, Ticketplace, ou autre) :
 * un seul contrat minimal, à adapter uniquement dans la route elle-même
 * (mapping des champs propres au prestataire réel vers cette forme) le
 * jour où un prestataire est branché. Ne remplace jamais la validation
 * manuelle admin (`confirmCompanyPayment`/`confirmEventPayment`/
 * `confirmCreditPurchase`, tous encore accessibles) — ce webhook n'est
 * qu'un chemin de confirmation automatique en plus, pour les prestataires
 * qui l'offrent.
 *
 * `reference` = l'id de notre propre enregistrement (CompanyPayment /
 * EventRegistration / CreditPurchase selon `type`), que le prestataire doit
 * nous renvoyer tel quel — à transmettre lors de l'initiation du paiement
 * chez lui (mécanisme d'initiation lui-même hors périmètre : aujourd'hui
 * aucun paiement n'est initié via une API externe, l'utilisateur paie hors
 * plateforme puis y revient).
 */
export const paymentWebhookSchema = z.object({
  event: z.enum(["payment.confirmed", "payment.failed"]),
  type: z.enum(["company_payment", "event_registration", "credit_purchase"]),
  reference: z.string().min(1),
  amount: z.number().positive().optional(),
});

export type PaymentWebhookPayload = z.infer<typeof paymentWebhookSchema>;
