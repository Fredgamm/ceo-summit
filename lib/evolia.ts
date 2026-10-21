import { createHmac } from "crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { seatCap } from "@/lib/company-seats";
import { isEvoliaPaymentMethod } from "@/lib/payment-methods";
import { toZonedIso } from "@/lib/event-timezone";
import { appUrl } from "@/lib/app-url";
import { getEvoliaConfig, PAYMENT_URL_PLACEHOLDER } from "@/lib/evolia-config";

/**
 * Intégration Evolia — échange 1 (conception/11 §3) : CEO Summit pousse les
 * inscriptions vers Evolia, qui encaisse les paiements par carte ou Mobile
 * Money puis confirme sur notre webhook (échange 2,
 * app/api/webhooks/payments). Chaque envoi est journalisé (`EvoliaPush`) ; un
 * échec ne bloque jamais l'action qui l'a déclenché, l'admin peut relancer.
 *
 * Signature : HMAC-SHA256 du corps brut avec la clé d'envoi Evolia, en
 * hexadécimal dans `X-Webhook-Signature: sha256=<hex>` (même schéma que notre
 * webhook entrant). Adresses et clé : /admin/parametres, à défaut les
 * variables d'environnement (lib/evolia-config.ts).
 */

const REQUEST_TIMEOUT_MS = 10_000;

export async function evoliaPaymentUrl(reference: string): Promise<string> {
  const { paymentUrlTemplate } = await getEvoliaConfig();
  return paymentUrlTemplate.replace(PAYMENT_URL_PLACEHOLDER, encodeURIComponent(reference));
}

export function signEvoliaBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

// ─── Construction des envois ──────────────────────────────────────────────

const COMPANY_INCLUDE = {
  subscription: { include: { plan: { include: { event: true } } } },
  companyAdmin: { select: { id: true, name: true, email: true, title: true } },
} satisfies Prisma.CompanyInclude;

type CompanyForPush = Prisma.CompanyGetPayload<{ include: typeof COMPANY_INCLUDE }>;

function eventInfo(company: CompanyForPush) {
  const event = company.subscription?.plan.event;
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    // Module 21 D19 — heure et décalage du fuseau de l'événement
    // (« 2026-11-15T09:00:00+03:00 » à Madagascar, « +04:00 » à La Réunion).
    startsAt: toZonedIso(event.date, event.timezone),
    endsAt: event.endDate ? toZonedIso(event.endDate, event.timezone) : null,
    timezone: event.timezone,
    location: event.isOnline ? "En ligne" : event.location,
  };
}

function companyInfo(company: CompanyForPush) {
  return { name: company.name, sector: company.sector, country: company.country };
}

/**
 * 20 oct. 2026 — « ticket » d'un participant (demande d'Evolia, pour le
 * badge) : l'offre qui lui donne accès à l'événement. La photo de profil
 * n'est volontairement pas transmise : facultative, la rendre nécessaire
 * bloquerait des participants.
 */
function ticketOf(plan: { name: string; description: string | null } | null | undefined) {
  return plan ? { type: plan.name, description: plan.description ?? null } : null;
}

function managerOnly(company: CompanyForPush) {
  return company.companyAdmin
    ? [
        {
          fullName: company.companyAdmin.name,
          email: company.companyAdmin.email,
          isInitiator: true,
          title: company.companyAdmin.title ?? null,
          ticket: ticketOf(company.subscription?.plan),
        },
      ]
    : [];
}

async function confirmedParticipants(company: CompanyForPush) {
  const eventId = company.subscription?.plan.eventId;
  if (!eventId) return [];
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId, status: "CONFIRMED", user: { companyId: company.id } },
    include: {
      user: { select: { id: true, name: true, email: true, title: true } },
      plan: { select: { name: true, description: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return registrations.map((r) => ({
    fullName: r.user.name,
    email: r.user.email,
    isInitiator: r.user.id === company.companyAdminId,
    // Fonction : facultative à l'inscription, donc parfois absente.
    title: r.user.title ?? null,
    // Offre de l'inscription, à défaut celle de l'entreprise.
    ticket: ticketOf(r.plan ?? company.subscription?.plan),
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
    // Evolia refuse une liste vide : pour un supplément acheté avant que la
    // liste soit validée, on transmet le gérant, comme pour l'offre.
    const confirmed = isUpsell ? await confirmedParticipants(company) : [];
    const participants = confirmed.length > 0 ? confirmed : managerOnly(company);

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

    const participants = await confirmedParticipants(company);
    if (participants.length === 0) {
      // Evolia refuse une liste vide (la validation l'interdit déjà côté gérant).
      console.warn(`[evolia] participants push skipped for ${company.id}: empty list`);
      return;
    }

    const reference = offerPayment?.id ?? company.subscription.id;
    if (!offerPayment) await ensurePaymentlessRegistration(company, reference);

    const payload = {
      event: "company.participants.confirmed",
      companyId: company.id,
      ceoSummitReference: reference,
      company: companyInfo(company),
      offer: {
        name: company.subscription.plan.name,
        description: company.subscription.plan.description ?? null,
        includedParticipants: seatCap(company.subscription),
      },
      eventDetails: eventInfo(company),
      participants,
    };
    await sendToEvolia(company.id, payload.event, reference, payload);
  } catch (err) {
    console.error("[evolia] failed to build participants push", err);
  }
}

/**
 * Offre sans paiement (partenaire institutionnel, module 20) : Evolia
 * n'accepte une liste de participants que pour une inscription qu'il connaît.
 * On lui transmet donc une fois l'inscription, comme réglée (« virement »,
 * sans montant), sous la référence de l'abonnement.
 */
async function ensurePaymentlessRegistration(company: CompanyForPush, reference: string) {
  const alreadySent = await prisma.evoliaPush.findFirst({
    where: { reference, event: "company.registration.pushed", status: "SENT" },
    select: { id: true },
  });
  if (alreadySent || !company.subscription) return;

  const payload = {
    event: "company.registration.pushed",
    companyId: company.id,
    ceoSummitReference: reference,
    paymentMethod: "virement",
    company: companyInfo(company),
    offer: {
      name: company.subscription.plan.name,
      description: company.subscription.plan.description ?? null,
      includedParticipants: seatCap(company.subscription),
    },
    eventDetails: eventInfo(company),
    participants: managerOnly(company),
  };
  await sendToEvolia(company.id, payload.event, reference, payload);
}

// ─── Envoi et relance ─────────────────────────────────────────────────────

/** Anciennes valeurs (avant le 8 oct. 2026) encore présentes dans des envois journalisés. */
const LEGACY_PAYMENT_METHODS: Record<string, string> = {
  CARTE_BANCAIRE: "evolia",
  MOBILE_MONEY: "evolia",
  VIREMENT: "virement",
  CHEQUE: "virement",
};

/** Message lisible pour l'admin plutôt que la page HTML d'un pare-feu ou d'un proxy. */
function describeFailure(status: number, text: string): string {
  if (/just a moment|challenges\.cloudflare\.com/i.test(text)) {
    return `HTTP ${status} — bloqué par le pare-feu Cloudflare d'Evolia (page de vérification anti-robots).`;
  }
  if (/^\s*</.test(text)) {
    return `HTTP ${status} — réponse HTML inattendue : l'adresse ne semble pas être l'API d'Evolia.`;
  }
  return text.slice(0, 1000) || `HTTP ${status}`;
}

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

  const { outboundSecret: secret, registrationUrl: url } = await getEvoliaConfig();
  const record = (data: Prisma.EvoliaPushUpdateInput) =>
    prisma.evoliaPush.update({
      where: { id: pushId },
      data: { attempts: { increment: 1 }, ...data },
    });

  if (!secret) {
    await record({ status: "FAILED", lastError: "Clé d'envoi Evolia non configurée (Paramètres › Intégrations)." });
    return false;
  }

  const payload = push.payload as Record<string, unknown>;
  const legacyMethod = LEGACY_PAYMENT_METHODS[String(payload.paymentMethod)];
  const body = JSON.stringify(legacyMethod ? { ...payload, paymentMethod: legacyMethod } : payload);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signEvoliaBody(body, secret),
        "User-Agent": `CEO-Summit-Platform/1.0 (+${appUrl()})`,
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
      lastError: describeFailure(response.status, text),
    });
    return false;
  } catch (err) {
    await record({ status: "FAILED", lastError: (err as Error).message.slice(0, 1000) });
    console.error("[evolia] push failed", err);
    return false;
  }
}
