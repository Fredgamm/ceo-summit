import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyHmacSignature } from "@/lib/hmac";
import { paymentWebhookSchema, type PaymentWebhookPayload } from "@/lib/validations/webhooks";
import {
  confirmCompanyPaymentCore,
  confirmCreditPurchaseCore,
  confirmEventRegistrationPaymentCore,
} from "@/lib/payment-confirmations";

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
  const rawBody = await req.text();
  const signature = req.headers.get("X-Webhook-Signature");
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[payments webhook] PAYMENT_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    await prisma.webhookLog.create({
      data: {
        source: "payments",
        event: "unknown",
        payload: safeParseForLogging(rawBody),
        status: "REJECTED_INVALID_SIGNATURE",
        error: "HMAC signature mismatch",
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

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: "PROCESSED", processedAt: new Date() },
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
 * (`PaymentStatus.FAILED`) — `CompanyPayment`/`CreditPurchase` n'ont que
 * PENDING/CONFIRMED/REJECTED (pas de valeur "échoué" distincte). Plutôt que
 * d'étendre ces enums pour ce cas encore hypothétique (aucun prestataire
 * branché), on se contente de laisser l'échec dans `WebhookLog` pour ces
 * deux types — l'admin garde la main via le refus manuel existant.
 */
async function dispatchPaymentWebhook(
  payload: PaymentWebhookPayload
): Promise<{ success: true } | { success: false; error: string }> {
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
      const result = await confirmCompanyPaymentCore(payload.reference, null);
      return result.success ? { success: true } : result;
    }
    case "event_registration": {
      return confirmEventRegistrationPaymentCore(payload.reference, null);
    }
    case "credit_purchase": {
      return confirmCreditPurchaseCore(payload.reference, null);
    }
  }
}

function safeParseForLogging(rawBody: string): object {
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody.slice(0, 500) };
  }
}
