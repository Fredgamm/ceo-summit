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
/** Renvoie `true` si Evolia a reçu la liste (retenue, vide ou refusée : `false`). */
export async function pushParticipantsToEvolia(companyId: string): Promise<boolean> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: COMPANY_INCLUDE,
    });
    if (!company?.subscription) return false;

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
      return false;
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
    return await sendToEvolia(company.id, payload.event, reference, payload);
  } catch (err) {
    console.error("[evolia] failed to build participants push", err);
    return false;
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
    // Retenu (Evolia pas encore activé) compte comme déjà transmis : il partira à l'activation.
    where: {
      reference,
      event: "company.registration.pushed",
      status: { in: ["SENT", "HELD"] },
    },
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
  // 23 oct. 2026 — tant que la clé de production n'est pas validée
  // (Paramètres › Intégrations), l'envoi est enregistré mais retenu : il part
  // à l'activation (releaseHeldEvoliaPushes), rien n'est perdu.
  const { live } = await getEvoliaConfig();
  const push = await prisma.evoliaPush.create({
    data: {
      companyId,
      event,
      reference,
      payload: payload as Prisma.InputJsonValue,
      ...(live ? {} : { status: "HELD" as const }),
    },
  });
  if (!live) return false;
  return deliverEvoliaPush(push.id);
}

/**
 * 23 oct. 2026 — à l'activation d'Evolia : transmet les envois retenus, les
 * inscriptions d'abord (Evolia n'accepte une liste de participants que pour
 * une inscription qu'il connaît), puis la liste de participants la plus
 * récente de chaque entreprise. Sont écartés (SKIPPED) : l'inscription d'un
 * paiement annulé ou refusé entre-temps, et les listes remplacées par une plus
 * récente. Un envoi qui échoue reste visible et renvoyable depuis la fiche
 * de l'entreprise.
 */
export async function releaseHeldEvoliaPushes(
  options: { retryFailedRegistrations?: boolean } = {}
): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  /** Listes gardées en attente : l'inscription de leur entreprise n'est pas encore chez Evolia. */
  deferred: number;
}> {
  const held = await prisma.evoliaPush.findMany({
    where: { status: "HELD" },
    orderBy: { createdAt: "asc" },
  });

  // Chaque envoi est « réservé » avant d'être traité : deux transmissions
  // simultanées (deux admins, double clic) ne l'envoient jamais deux fois.
  const claim = async (id: string, from: "HELD" | "FAILED") =>
    (
      await prisma.evoliaPush.updateMany({
        where: { id, status: from },
        data: { status: "PENDING" },
      })
    ).count === 1;
  const setAside = (id: string, from: "HELD" | "PENDING", reason: string) =>
    prisma.evoliaPush.updateMany({
      where: { id, status: from },
      data: { status: "SKIPPED", lastError: reason },
    });

  const registrations: { id: string; reference: string | null; from: "HELD" | "FAILED" }[] = held
    .filter((p) => p.event === "company.registration.pushed")
    .map((p) => ({ id: p.id, reference: p.reference, from: "HELD" as const }));
  // Bouton « Transmettre les envois retenus » : réessaie aussi les inscriptions
  // en échec, sans quoi les listes de ces entreprises resteraient bloquées.
  if (options.retryFailedRegistrations) {
    const failedRegistrations = await prisma.evoliaPush.findMany({
      where: { status: "FAILED", event: "company.registration.pushed" },
      orderBy: { createdAt: "asc" },
      select: { id: true, reference: true },
    });
    registrations.push(...failedRegistrations.map((p) => ({ ...p, from: "FAILED" as const })));
  }
  const heldLists = held.filter((p) => p.event === "company.participants.confirmed");

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;

  for (const push of registrations) {
    const payment = push.reference
      ? await prisma.companyPayment.findUnique({
          where: { id: push.reference },
          select: { status: true },
        })
      : null;
    if (payment?.status === "REJECTED") {
      if (push.from === "HELD") {
        const { count } = await setAside(
          push.id,
          "HELD",
          "Paiement annulé ou refusé avant l'activation d'Evolia : non transmis."
        );
        skipped += count;
      }
      continue;
    }
    if (!(await claim(push.id, push.from))) continue;
    if (await deliverEvoliaPush(push.id)) sent++;
    else failed++;
  }

  // Une liste par entreprise, recalculée maintenant : jamais un instantané
  // périmé qui écraserait chez Evolia une liste plus récente (badges).
  const companies = [...new Set(heldLists.map((p) => p.companyId))];
  for (const companyId of companies) {
    const lists = heldLists.filter((p) => p.companyId === companyId);
    // Evolia refuse la liste d'une inscription qu'il ne connaît pas : elle
    // reste retenue tant qu'aucune inscription de l'entreprise n'y est arrivée.
    const registered = await prisma.evoliaPush.findFirst({
      where: { companyId, event: "company.registration.pushed", status: "SENT" },
      select: { id: true },
    });
    if (!registered) {
      deferred += lists.length;
      continue;
    }
    const claimed: string[] = [];
    for (const list of lists) if (await claim(list.id, "HELD")) claimed.push(list.id);
    if (claimed.length === 0) continue;
    for (const id of claimed) {
      await setAside(
        id,
        "PENDING",
        "Remplacé par la liste à jour envoyée à l'activation d'Evolia."
      );
    }
    skipped += claimed.length;
    if (await pushParticipantsToEvolia(companyId)) sent++;
    else failed++;
  }

  return { sent, failed, skipped, deferred };
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
    await record({
      status: "FAILED",
      lastError: "Clé d'envoi Evolia non configurée (Paramètres › Intégrations).",
    });
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

/**
 * Lance la transmission des envois retenus sans la faire attendre à l'écran :
 * des centaines d'envois (jusqu'à 10 s chacun) dépasseraient le délai d'une
 * requête. Le résultat est inscrit au journal d'audit ; le nombre d'envois
 * retenus restant s'affiche dans Paramètres › Intégrations.
 */
export function startEvoliaReleaseInBackground(
  actorId: string,
  options: { retryFailedRegistrations?: boolean } = {}
): void {
  void releaseHeldEvoliaPushes(options)
    .then((result) =>
      prisma.auditLog.create({
        data: {
          actorId,
          action: "evolia_push.release",
          targetType: "EvoliaPush",
          targetId: "held",
          metadata: result,
        },
      })
    )
    .catch((err) => console.error("[evolia] background release failed", err));
}
