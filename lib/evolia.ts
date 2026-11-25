import { AsyncLocalStorage } from "async_hooks";
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
      // 25 nov. 2026 — Evolia exige `amountDue` et `currency` dans tous les cas,
      // virement compris (422 « amountDue requis » sinon : IXEO en production).
      amountDue: payment.amount,
      currency: "MGA",
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

// ─── Liste envoyée trop tôt (24 nov. 2026) ────────────────────────────────
//
// Evolia refuse une liste (409 « Paiement en attente ») tant qu'il n'a pas
// enregistré l'encaissement de son côté. Or la confirmation d'un paiement par
// son webhook inscrit les membres et envoie la liste PENDANT l'appel, avant
// notre réponse : Evolia considère alors encore le paiement en attente (cas
// réel en production, 24 nov. 2026). Deux protections :
// 1. pendant le webhook, les listes sont mises de côté puis envoyées après la
//    réponse (`deferParticipantPushes`, appelé par la route) ;
// 2. partout, une liste refusée pour paiement en attente est recalculée et
//    renvoyée automatiquement (30 s, 2 min, 10 min).

const deferredParticipantPushes = new AsyncLocalStorage<Set<string>>();

/**
 * Exécute `fn` en mettant de côté les listes de participants qu'il enverrait.
 * Renvoie les entreprises concernées : à transmettre ensuite, une fois la
 * réponse partie, avec `flushDeferredParticipantPushes`.
 */
export async function deferParticipantPushes<T>(
  fn: () => Promise<T>
): Promise<{ result: T; companyIds: string[] }> {
  const companies = new Set<string>();
  const result = await deferredParticipantPushes.run(companies, fn);
  return { result, companyIds: [...companies] };
}

export async function flushDeferredParticipantPushes(companyIds: string[]): Promise<void> {
  for (const companyId of companyIds) {
    await pushParticipantsToEvolia(companyId);
  }
}

/** Délais des nouveaux essais après un refus « paiement en attente ». */
export const PENDING_PAYMENT_RETRY_DELAYS_MS = [30_000, 120_000, 600_000];
const pendingRetries = new Map<string, ReturnType<typeof setTimeout>>();

export function isPendingPaymentRefusal(push: {
  event: string;
  httpStatus: number | null;
  lastError: string | null;
}): boolean {
  return (
    push.event === "company.participants.confirmed" &&
    push.httpStatus === 409 &&
    /paiement en attente/i.test(push.lastError ?? "")
  );
}

/**
 * Programme un nouvel essai de la liste d'une entreprise. Un seul essai en
 * attente par entreprise : la liste est recalculée au moment de l'envoi.
 * Perdu si le serveur redémarre entre-temps — l'envoi refusé reste alors
 * visible et renvoyable depuis la fiche de l'entreprise.
 */
function scheduleParticipantsRetry(companyId: string, failedPushId: string, attempt: number) {
  const delay = PENDING_PAYMENT_RETRY_DELAYS_MS[attempt];
  if (delay == null) return;
  clearTimeout(pendingRetries.get(companyId));
  const timer = setTimeout(() => {
    pendingRetries.delete(companyId);
    void retryParticipantsPush(companyId, failedPushId, attempt + 1).catch((err) =>
      console.error("[evolia] participants retry failed", err)
    );
  }, delay);
  timer.unref?.();
  pendingRetries.set(companyId, timer);
}

async function retryParticipantsPush(companyId: string, failedPushId: string, attempt: number) {
  const failed = await prisma.evoliaPush.findUnique({
    where: { id: failedPushId },
    select: { status: true, createdAt: true },
  });
  // Renvoyé à la main entre-temps (bouton « Relancer ») : rien à faire.
  if (!failed || failed.status !== "FAILED") return;
  const newer = await prisma.evoliaPush.findFirst({
    where: {
      companyId,
      event: "company.participants.confirmed",
      status: "SENT",
      createdAt: { gt: failed.createdAt },
    },
    select: { id: true },
  });
  if (!newer) await pushParticipantsToEvolia(companyId, attempt);
  await prisma.evoliaPush.updateMany({
    where: { id: failedPushId, status: "FAILED" },
    data: {
      status: "SKIPPED",
      lastError: newer
        ? "Remplacé par une liste plus récente, reçue par Evolia."
        : "Paiement pas encore enregistré chez Evolia : remplacé par un nouvel essai automatique.",
    },
  });
}

/** `company.participants.confirmed` — la liste validée par le gérant, qui fait foi pour les badges. */
/** Renvoie `true` si Evolia a reçu la liste (retenue, vide, refusée ou différée : `false`). */
export async function pushParticipantsToEvolia(
  companyId: string,
  /** Nouvel essai après un refus « paiement en attente » (0 = premier envoi). */
  retryAttempt = 0
): Promise<boolean> {
  const deferred = deferredParticipantPushes.getStore();
  if (deferred) {
    deferred.add(companyId);
    return false;
  }
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
    // 25 nov. 2026 — Evolia refuse la liste tant qu'un paiement encaissé chez
    // nous (virement, chèque) ne lui a pas été confirmé : rattrapage ici.
    await ensurePaymentConfirmations(
      company.id,
      company.subscription.id,
      offerPayment ? null : reference
    );

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
    const ok = await sendToEvolia(company.id, payload.event, reference, payload);
    if (!ok) {
      const last = await prisma.evoliaPush.findFirst({
        where: { companyId: company.id, event: payload.event },
        orderBy: { createdAt: "desc" },
        select: { id: true, event: true, status: true, httpStatus: true, lastError: true },
      });
      if (last?.status === "FAILED" && isPendingPaymentRefusal(last)) {
        scheduleParticipantsRetry(company.id, last.id, retryAttempt);
      }
    }
    return ok;
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
    // Evolia (25 nov. 2026) : offre sans paiement = `amountDue: 0`, puis
    // `payment.confirmed` avec `amount: 0`.
    amountDue: 0,
    currency: "MGA",
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

// ─── Confirmation d'un paiement encaissé chez nous (25 nov. 2026) ─────────
//
// Evolia ne connaît comme réglés que les paiements qu'il a encaissés (carte,
// Mobile Money). Un virement ou un chèque validé par notre admin reste « en
// attente » chez lui, et il refuse alors la liste des participants (409) :
// on lui confirme l'encaissement sur son adresse dédiée.

const CONFIRMATION_EVENT = "payment.confirmed";

/** Confirme à Evolia un paiement encaissé chez nous. `true` si Evolia l'a reçu. */
export async function confirmPaymentToEvolia(
  companyId: string,
  reference: string,
  amount: number
): Promise<boolean> {
  const payload = {
    event: CONFIRMATION_EVENT,
    type: "company_payment",
    reference,
    amount,
  };
  try {
    return await sendToEvolia(companyId, CONFIRMATION_EVENT, reference, payload);
  } catch (err) {
    // Comme les autres envois : jamais d'échec de l'action qui l'a déclenché.
    console.error("[evolia] failed to send payment confirmation", err);
    return false;
  }
}

/**
 * Envoie les confirmations qui manquent pour l'abonnement : chaque virement
 * ou chèque confirmé (offre et suppléments), et l'abonnement lui-même pour une
 * offre sans paiement (`paymentlessReference`, montant 0). Une confirmation
 * déjà reçue ou retenue n'est pas renvoyée.
 */
async function ensurePaymentConfirmations(
  companyId: string,
  subscriptionId: string,
  paymentlessReference: string | null
) {
  const payments = await prisma.companyPayment.findMany({
    where: {
      companySubscriptionId: subscriptionId,
      status: "CONFIRMED",
      // Virement / chèque, ou carte / Mobile Money confirmé à la main par l'admin
      // (`reviewedById` vide = confirmé par le webhook d'Evolia lui-même).
      OR: [{ method: { in: ["VIREMENT", "CHEQUE"] } }, { reviewedById: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true },
  });
  const due = payments.map((p) => ({ reference: p.id, amount: p.amount }));
  if (paymentlessReference) due.push({ reference: paymentlessReference, amount: 0 });
  if (due.length === 0) return;

  const done = await prisma.evoliaPush.findMany({
    where: {
      event: CONFIRMATION_EVENT,
      reference: { in: due.map((d) => d.reference) },
      status: { in: ["SENT", "HELD", "PENDING"] },
    },
    select: { reference: true },
  });
  const confirmed = new Set(done.map((d) => d.reference));
  const pending = due.filter((d) => !confirmed.has(d.reference));
  if (pending.length === 0) return;

  // Evolia refuse la confirmation d'une référence qu'il ne connaît pas : une
  // inscription jamais reçue (ex. refusée avant le correctif `amountDue`) est
  // d'abord renvoyée, recalculée. L'offre sans paiement est déjà traitée par
  // `ensurePaymentlessRegistration`.
  const paidRefs = pending.map((d) => d.reference).filter((r) => r !== paymentlessReference);
  const registered =
    paidRefs.length === 0
      ? []
      : await prisma.evoliaPush.findMany({
          where: {
            event: "company.registration.pushed",
            reference: { in: paidRefs },
            status: { in: ["SENT", "HELD", "PENDING"] },
          },
          select: { reference: true },
        });
  const known = new Set(registered.map((r) => r.reference));
  for (const { reference, amount } of pending) {
    if (paidRefs.includes(reference) && !known.has(reference)) {
      const delivered = await pushRegistrationToEvolia(reference);
      if (delivered) {
        // L'ancienne inscription refusée ne doit plus être renvoyée telle quelle.
        await prisma.evoliaPush.updateMany({
          where: { event: "company.registration.pushed", reference, status: "FAILED" },
          data: { status: "SKIPPED", lastError: "Remplacée par l'inscription recalculée." },
        });
      } else if ((await getEvoliaConfig()).live) {
        continue; // inscription refusée : la confirmation le serait aussi
      }
    }
    await confirmPaymentToEvolia(companyId, reference, amount);
  }
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

  // Une inscription en échec est reconstruite à partir des données actuelles
  // plutôt que renvoyée telle quelle : son contenu enregistré date parfois d'avant
  // une évolution de l'API d'Evolia (montant, devise, fin de l'événement…) et
  // serait refusé à chaque fois (« Corps de requête invalide »).
  const rebuilt = new Set<string>();

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

    if (push.from === "FAILED" && payment && push.reference) {
      if (rebuilt.has(push.reference)) {
        // Plusieurs échecs pour le même paiement : un seul envoi reconstruit suffit.
        await setAside(push.id, "PENDING", "Doublon : remplacé par un envoi reconstruit.");
        skipped++;
        continue;
      }
      rebuilt.add(push.reference);
      const startedAt = new Date();
      const ok = await pushRegistrationToEvolia(push.reference);
      const replacement = await prisma.evoliaPush.findFirst({
        where: {
          reference: push.reference,
          event: "company.registration.pushed",
          createdAt: { gte: startedAt },
        },
        select: { id: true },
      });
      if (replacement) {
        await setAside(push.id, "PENDING", "Reconstruit avec les données à jour : nouvel envoi.");
      } else {
        // Rien n'a pu être reconstruit : l'envoi d'origine reste en échec, visible et renvoyable.
        await prisma.evoliaPush.updateMany({
          where: { id: push.id, status: "PENDING" },
          data: { status: "FAILED", lastError: "Reconstruction impossible : données manquantes." },
        });
      }
      if (ok) sent++;
      else failed++;
      continue;
    }

    if (await deliverEvoliaPush(push.id)) sent++;
    else failed++;
  }

  // 25 nov. 2026 — confirmations des virements et chèques, avant les listes :
  // sans elles, Evolia refuse la liste (paiement en attente).
  for (const push of held.filter((p) => p.event === CONFIRMATION_EVENT)) {
    if (!(await claim(push.id, "HELD"))) continue;
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

  const config = await getEvoliaConfig();
  const secret = config.outboundSecret;
  const url = push.event === CONFIRMATION_EVENT ? config.confirmationUrl : config.registrationUrl;
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
