import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyHmacSignature } from "@/lib/hmac";
import { paymentWebhookSchema, type PaymentWebhookPayload } from "@/lib/validations/webhooks";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  confirmCompanyPaymentCore,
  confirmEventRegistrationPaymentCore,
} from "@/lib/payment-confirmations";

const WEBHOOK_RATE_LIMIT = 60;
const WEBHOOK_RATE_WINDOW_SEC = 60;
/** Âge maximum d'une requête horodatée (`X-Webhook-Timestamp`), en secondes. */
const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 5 * 60;

/**
 * POST /api/webhooks/payments — confirmation de paiement générique (7 août
 * 2026). Pour un prestataire externe qui gère la transaction hors
 * plateforme et nous renvoie juste le résultat (ex. Evolia) : on suit le
 * parcours habituel (mêmes fonctions que le clic admin manuel), sans jamais
 * remplacer ce clic — les deux coexistent. `reference` = l'id de notre
 * propre enregistrement, voir doc sur `paymentWebhookSchema`.
 *
 * Aucun prestataire n'est branché à ce stade : le nom "payments" (plutôt que
 * "evolia") et le schéma minimal sont volontairement génériques, à adapter
 * dans ce fichier (mapping des champs propres au prestataire réel) une fois
 * un prestataire choisi.
 */
export async function POST(req: Request) {
  /**
   * Correctif (9 septembre 2026, audit sécurité Evolia) — endpoint public,
   * non authentifié par session : sans limite de débit, une requête invalide
   * envoyée en boucle écrivait quand même une ligne `WebhookLog` à chaque
   * rejet de signature (voir plus bas), avant même toute vérification —
   * amplification d'écriture en base exploitable pour un déni de service.
   * Bornée par IP, avant toute lecture du corps ou écriture.
   */
  const rateLimit = await checkRateLimit(
    `webhook:payments:${getIpFromRequest(req)}`,
    WEBHOOK_RATE_LIMIT,
    WEBHOOK_RATE_WINDOW_SEC
  );
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-Webhook-Signature");
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[payments webhook] PAYMENT_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  /**
   * Audit MVP (25 septembre 2026) — anti-rejeu optionnel et rétro-compatible.
   * Si l'expéditeur envoie `X-Webhook-Timestamp` (secondes Unix), la
   * signature porte sur `${timestamp}.${corps brut}` et une requête de plus
   * de 5 minutes est refusée : une confirmation interceptée ne peut plus
   * être rejouée plus tard. Sans cet en-tête, comportement inchangé
   * (signature du corps seul) — la documentation déjà transmise à Evolia
   * reste valable.
   */
  const timestamp = req.headers.get("X-Webhook-Timestamp");
  const verification = verifyPaymentSignature(rawBody, signature, timestamp, secret);
  if (!verification.valid) {
    await prisma.webhookLog.create({
      data: {
        source: "payments",
        event: "unknown",
        payload: safeParseForLogging(rawBody),
        status: "REJECTED_INVALID_SIGNATURE",
        error: verification.reason,
      },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = paymentWebhookSchema.safeParse(json);
  if (!parsed.success) {
    await prisma.webhookLog.create({
      data: {
        source: "payments",
        event: (json as { event?: string })?.event ?? "unknown",
        payload: json as object,
        status: "FAILED",
        error: `Validation failed: ${parsed.error.message}`,
      },
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const payload = parsed.data;
  const log = await prisma.webhookLog.create({
    data: {
      source: "payments",
      event: `${payload.event}:${payload.type}`,
      payload: json as object,
      status: "RECEIVED",
    },
  });

  try {
    const result = await dispatchPaymentWebhook(payload);
    if (!result.success) {
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: "FAILED", error: result.error },
      });
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    if (result.warning) {
      console.error(`[payments webhook] ${result.warning}`, { reference: payload.reference });
    }
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "PROCESSED", processedAt: new Date(), error: result.warning ?? null },
    });
    return NextResponse.json({ data: { received: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: message },
    });
    console.error("[payments webhook] processing failed", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

/**
 * `payment.failed` n'a un statut dédié que côté `EventRegistration`
 * (`PaymentStatus.FAILED`) — `CompanyPayment` n'a que
 * PENDING/CONFIRMED/REJECTED (pas de valeur "échoué" distincte). Plutôt que
 * d'étendre cet enum pour ce cas encore hypothétique (aucun prestataire
 * branché), on se contente de laisser l'échec dans `WebhookLog` pour ce
 * type — l'admin garde la main via le refus manuel existant.
 */
type DispatchResult = { success: true; warning?: string } | { success: false; error: string };

async function dispatchPaymentWebhook(payload: PaymentWebhookPayload): Promise<DispatchResult> {
  if (payload.event === "payment.failed") {
    if (payload.type === "event_registration") {
      const { count } = await prisma.eventRegistration.updateMany({
        where: { id: payload.reference, paymentStatus: "PENDING" },
        data: { paymentStatus: "FAILED" },
      });
      if (count === 0) {
        return { success: false, error: "Inscription introuvable ou déjà traitée." };
      }
    }
    return { success: true };
  }

  switch (payload.type) {
    case "company_payment": {
      /**
       * Correctif (9 septembre 2026, audit sécurité Evolia) — `amount` du
       * prestataire n'était jamais confronté au montant réellement dû
       * (`CompanyPayment.amount`, fixé à la soumission de la preuve/au push
       * d'inscription) : une confirmation à n'importe quel montant activait
       * l'accès complet sans que rien ne le remarque. Ne bloque pas la
       * confirmation (le prestataire reste la source de vérité sur le
       * paiement effectivement reçu) — signale seulement l'écart pour revue
       * admin, via WebhookLog.error + log serveur.
       */
      let warning: string | undefined;
      if (payload.amount != null) {
        const existing = await prisma.companyPayment.findUnique({
          where: { id: payload.reference },
          select: { amount: true },
        });
        if (existing && existing.amount !== payload.amount) {
          warning = `Montant confirmé (${payload.amount}) différent du montant dû (${existing.amount}) pour ${payload.reference}.`;
        }
      }
      const result = await confirmCompanyPaymentCore(payload.reference, null);
      return result.success ? { success: true, warning } : result;
    }
    case "event_registration": {
      return confirmEventRegistrationPaymentCore(payload.reference, null);
    }
  }
}

function verifyPaymentSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): { valid: true } | { valid: false; reason: string } {
  if (timestamp === null) {
    return verifyHmacSignature(rawBody, signature, secret)
      ? { valid: true }
      : { valid: false, reason: "HMAC signature mismatch" };
  }
  const timestampSec = Number(timestamp);
  if (!/^\d+$/.test(timestamp.trim()) || !Number.isFinite(timestampSec)) {
    return { valid: false, reason: "Invalid X-Webhook-Timestamp" };
  }
  if (Math.abs(Date.now() / 1000 - timestampSec) > WEBHOOK_TIMESTAMP_TOLERANCE_SEC) {
    return { valid: false, reason: "X-Webhook-Timestamp outside tolerance" };
  }
  return verifyHmacSignature(`${timestamp.trim()}.${rawBody}`, signature, secret)
    ? { valid: true }
    : { valid: false, reason: "HMAC signature mismatch" };
}

/**
 * Lit l'IP directement depuis la `Request` du route handler plutôt que via
 * `next/headers`' `headers()` (utilisé par lib/request-ip.ts pour les
 * Server Actions, sans accès direct à la requête) — cette dernière échoue
 * hors du contexte de requête App Router complet (ex. appel direct de
 * `POST()` en test). Même logique X-Real-IP/X-Forwarded-For que
 * lib/request-ip.ts::getClientIp.
 */
function getIpFromRequest(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

function safeParseForLogging(rawBody: string): object {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody.slice(0, 500) };
  }
}
