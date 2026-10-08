import { createHmac } from "crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { seatCap } from "@/lib/company-seats";
import { isEvoliaPaymentMethod } from "@/lib/payment-methods";

/**
 * Intégration Evolia — échange 1 (conception/11 §3) : CEO Summit pousse les
 * inscriptions vers Evolia, qui encaisse les paiements par carte ou Mobile
 * Money puis confirme sur notre webhook (échange 2,
 * app/api/webhooks/payments). Chaque envoi est journalisé (`EvoliaPush`) ; un
 * échec ne bloque jamais l'action qui l'a déclenché, l'admin peut relancer.
 *
 * Signature : HMAC-SHA256 du corps brut avec `EVOLIA_WEBHOOK_SECRET`, en
 * hexadécimal dans `X-Webhook-Signature: sha256=<hex>` (même schéma que notre
 * webhook entrant).
 */

const DEFAULT_REGISTRATION_URL = "https://api-event.aiolia.us/integration/ceosummit/registrations";
const DEFAULT_PAYMENT_URL = "https://event.aiolia.us/ceosummit/payment/{ceoSummitReference}";
const REQUEST_TIMEOUT_MS = 10_000;

export const EVOLIA_TIMEZONE = "Indian/Antananarivo";

export function evoliaPaymentUrl(reference: string): string {
  const template = process.env.EVOLIA_PAYMENT_URL ?? DEFAULT_PAYMENT_URL;
  return template.replace("{ceoSummitReference}", encodeURIComponent(reference));
}

/**
 * Date et heure telles que saisies par l'admin, avec le décalage de
 * Madagascar explicite (« 2026-11-15T09:00:00+03:00 »). Les horaires sont
 * saisis et affichés à l'heure du serveur (sans fuseau, module 18 §4.2) :
 * on reprend donc ces composants locaux plutôt que l'instant UTC stocké, qui
 * serait décalé de 3 h en production.
 */
export function toMadagascarIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00+03:00`
  );
}

export function signEvoliaBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

// ─── Construction des envois ──────────────────────────────────────────────

const COMPANY_INCLUDE = {
  subscription: { include: { plan: { include: { event: true } } } },
  companyAdmin: { select: { id: true, name: true, email: true } },
} satisfies Prisma.CompanyInclude;

type CompanyForPush = Prisma.CompanyGetPayload<{ include: typeof COMPANY_INCLUDE }>;

function eventInfo(company: CompanyForPush) {
  const event = company.subscription?.plan.event;
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    startsAt: toMadagascarIso(event.date),
    endsAt: event.endDate ? toMadagascarIso(event.endDate) : null,
    timezone: EVOLIA_TIMEZONE,
    location: event.isOnline ? "En ligne" : event.location,
  };
}

function companyInfo(company: CompanyForPush) {
  return { name: company.name, sector: company.sector, country: company.country };
}

async function confirmedParticipants(company: CompanyForPush) {
  const eventId = company.subscription?.plan.eventId;
  if (!eventId) return [];
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId, status: "CONFIRMED", user: { companyId: company.id } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return registrations.map((r) => ({
    fullName: r.user.name,
    email: r.user.email,
    isInitiator: r.user.id === company.companyAdminId,
  }));
}

/**
 * `company.registration.pushed` — un paiement d'offre ou de supplément
 * vient d'être enregistré. Avec carte ou Mobile Money, c'est ce qui
 * déclenche la collecte chez Evolia (`amountDue`) ; avec virement ou chèque,
 * il part à la validation par l'admin, pour information seulement.
 * Renvoie `true` si Evolia a accepté l'envoi.
 */
export async function pushRegistrationToEvolia(companyPaymentId: string): Promise<boolean> {
  try {
    const payment = await prisma.companyPayment.findUnique({
      where: { id: companyPaymentId },
      include: {
        upsellPlan: true,
        companySubscription: { include: { company: { include: COMPANY_INCLUDE } } },
      },
    });
    if (!payment) return false;
    const company = payment.companySubscription.company;
    const plan = payment.upsellPlan ?? company.subscription?.plan;
    if (!plan) return false;

    const collectsPayment = isEvoliaPaymentMethod(payment.method);
    const isUpsell = payment.upsellQuantity != null;
    const participants = isUpsell
      ? await confirmedParticipants(company)
      : company.companyAdmin
        ? [
            {
              fullName: company.companyAdmin.name,
              email: company.companyAdmin.email,
              isInitiator: true,
            },
          ]
        : [];

    const payload = {
      event: "company.registration.pushed",
      companyId: company.id,
      ceoSummitReference: payment.id,
      // Valeurs attendues par Evolia : « evolia » (à encaisser par eux) ou
      // « virement » (virement ou chèque, déjà validé par l'admin CEO Summit).
      paymentMethod: collectsPayment ? "evolia" : "virement",
      ...(collectsPayment ? { amountDue: payment.amount, currency: "MGA" } : {}),
      company: companyInfo(company),
      offer: {
        name: plan.name,
        description: plan.description ?? null,
        includedParticipants: isUpsell
          ? payment.upsellQuantity
          : company.subscription
            ? seatCap(company.subscription)
            : null,
      },
      eventDetails: eventInfo(company),
      participants,
    };
    return await sendToEvolia(company.id, payload.event, payment.id, payload);
  } catch (err) {
    console.error("[evolia] failed to build registration push", err);
    return false;
  }
}

/** `company.participants.confirmed` — la liste validée par le gérant, qui fait foi pour les badges. */
export async function pushParticipantsToEvolia(companyId: string): Promise<void> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: COMPANY_INCLUDE,
    });
    if (!company?.subscription) return;

    // Evolia exige `ceoSummitReference` sur chaque envoi : celle du paiement
    // de l'offre (déjà transmise avec l'inscription), ou l'abonnement pour une
    // offre sans paiement (partenaire institutionnel).
    const offerPayment = await prisma.companyPayment.findFirst({
      where: {
        companySubscriptionId: company.subscription.id,
        status: "CONFIRMED",
        upsellQuantity: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const payload = {
      event: "company.participants.confirmed",
      companyId: company.id,
      ceoSummitReference: offerPayment?.id ?? company.subscription.id,
      company: companyInfo(company),
      offer: {
        name: company.subscription.plan.name,
        description: company.subscription.plan.description ?? null,
        includedParticipants: seatCap(company.subscription),
      },
      eventDetails: eventInfo(company),
      participants: await confirmedParticipants(company),
    };
    await sendToEvolia(company.id, payload.event, null, payload);
  } catch (err) {
    console.error("[evolia] failed to build participants push", err);
  }
}

// ─── Envoi et relance ─────────────────────────────────────────────────────

async function sendToEvolia(
  companyId: string,
  event: string,
  reference: string | null,
  payload: Record<string, unknown>
): Promise<boolean> {
  const push = await prisma.evoliaPush.create({
    data: { companyId, event, reference, payload: payload as Prisma.InputJsonValue },
  });
  return deliverEvoliaPush(push.id);
}

/** Envoie (ou renvoie) un envoi journalisé, et enregistre le résultat. */
export async function deliverEvoliaPush(pushId: string): Promise<boolean> {
  const push = await prisma.evoliaPush.findUnique({ where: { id: pushId } });
  if (!push) return false;

  const secret = process.env.EVOLIA_WEBHOOK_SECRET;
  const url = process.env.EVOLIA_REGISTRATION_URL ?? DEFAULT_REGISTRATION_URL;
  const record = (data: Prisma.EvoliaPushUpdateInput) =>
    prisma.evoliaPush.update({
      where: { id: pushId },
      data: { attempts: { increment: 1 }, ...data },
    });

  if (!secret) {
    await record({ status: "FAILED", lastError: "EVOLIA_WEBHOOK_SECRET non configuré." });
    return false;
  }

  const body = JSON.stringify(push.payload);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signEvoliaBody(body, secret),
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      await record({
        status: "SENT",
        httpStatus: response.status,
        lastError: null,
        sentAt: new Date(),
      });
      return true;
    }
    const text = await response.text().catch(() => "");
    await record({
      status: "FAILED",
      httpStatus: response.status,
      lastError: text.slice(0, 1000) || `HTTP ${response.status}`,
    });
    return false;
  } catch (err) {
    await record({ status: "FAILED", lastError: (err as Error).message.slice(0, 1000) });
    console.error("[evolia] push failed", err);
    return false;
  }
}
