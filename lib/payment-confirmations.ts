import type { PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { seatCap } from "@/lib/company-seats";
import { sendTransactionalEmail } from "@/lib/resend";
import { sendSms } from "@/lib/sms";
import { formatDateFr } from "@/lib/utils";
import { resolveEmail } from "@/lib/email-template-resolver";
import { isEvoliaPaymentMethod, REVIVABLE_EVOLIA_REASONS } from "@/lib/payment-methods";
import { pushParticipantsToEvolia, pushRegistrationToEvolia } from "@/lib/evolia";
import { autoRegisterCompanyMembers } from "@/lib/event-auto-registration";

class AlreadyActiveError extends Error {}

/** Note posée sur un paiement confirmé par Evolia alors que l'offre était déjà réglée. */
export const DOUBLE_PAYMENT_NOTE =
  "Confirmé par Evolia alors que l'offre était déjà réglée — double paiement à rembourser.";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Logique de confirmation partagée entre l'action admin (clic manuel,
 * `requireAdmin` déjà vérifié par l'appelant) et le webhook paiement
 * générique (7 août 2026, `app/api/webhooks/payments/route.ts`) — un
 * prestataire externe peut confirmer automatiquement, en plus du clic
 * admin qui reste toujours disponible (les deux coexistent, aucun ne
 * remplace l'autre).
 *
 * `actorId: null` = confirmé par le webhook, pas par un humain — les deux
 * champs `reviewedById`/`confirmedById` (déjà nullables) restent `null`
 * dans ce cas, et aucune entrée `AuditLog` n'est écrite (`AuditLog.actorId`
 * n'est pas nullable, et n'a pas vocation à tracer les évènements
 * automatiques — c'est le rôle de `WebhookLog`, qui capture déjà le
 * payload complet de chaque appel webhook).
 *
 * IMPORTANT : ces fonctions ne sont volontairement PAS exportées depuis un
 * fichier `"use server"` — les rendre appelables directement par un client
 * contournerait `requireAdmin()`. Seuls les fichiers d'actions (qui
 * vérifient l'admin avant d'appeler) et la route webhook (qui vérifie la
 * signature HMAC avant d'appeler) doivent importer ce module.
 */

export async function confirmCompanyPaymentCore(
  companyPaymentId: string,
  actorId: string | null
): Promise<ActionResult<{ companyId: string; doublePayment?: boolean }>> {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: {
      companySubscription: {
        include: {
          plan: true,
          company: {
            include: {
              companyAdmin: true,
              users: {
                select: { id: true, status: true, createdAt: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
      upsellPlan: true,
    },
  });
  if (!payment) return { success: false, error: "Paiement introuvable." };

  const now = new Date();

  /**
   * 22 septembre 2026 (`conception/12` §3.2) — un paiement de supplément
   * (`upsellQuantity` non nul) n'active rien : l'abonnement est déjà actif.
   * Confirmer un tel paiement se limite à incrémenter `extraSeats` — pas de
   * transition de statut, pas de ré-inscription à l'évènement, pas de
   * recalcul des crédits (retirés du produit, voir `conception/09`).
   */
  if (payment.upsellQuantity != null) {
    const upsellQuantity = payment.upsellQuantity;
    // Audit (25 septembre 2026) — confirmation et incrément dans une même
    // transaction : un échec entre les deux laissait un paiement CONFIRMED
    // sans les places payées (et non rejouable, `status` n'étant plus PENDING).
    const confirmed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.companyPayment.updateMany({
        where: { id: companyPaymentId, status: "PENDING" },
        data: { status: "CONFIRMED", reviewedById: actorId, reviewedAt: now },
      });
      if (count === 0) return false;
      await tx.companySubscription.update({
        where: { id: payment.companySubscriptionId },
        data: { extraSeats: { increment: upsellQuantity } },
      });
      return true;
    });
    if (!confirmed) {
      return { success: false, error: "Ce paiement a déjà été traité." };
    }
    if (actorId) {
      await prisma.auditLog.create({
        data: {
          actorId,
          action: "company_payment.confirm_upsell",
          targetType: "CompanyPayment",
          targetId: companyPaymentId,
          metadata: { extraSeats: payment.upsellQuantity },
        },
      });
    }

    const upsellCompanyAdmin = payment.companySubscription.company.companyAdmin;
    if (upsellCompanyAdmin && payment.upsellPlan) {
      try {
        const email = await resolveEmail("company-upsell-confirmed", {
          adminName: upsellCompanyAdmin.name,
          companyName: payment.companySubscription.company.name,
          planName: payment.upsellPlan.name,
          quantity: payment.upsellQuantity,
        });
        if (email) await sendTransactionalEmail({ to: upsellCompanyAdmin.email, ...email });
      } catch (err) {
        console.error("[confirmCompanyPaymentCore] failed to send upsell confirmation email", err);
      }
    }

    await notifyEvolia(payment, true);
    // Module 21 — les nouvelles places sont remplies par les membres pas encore inscrits.
    await autoRegisterCompanyMembers(
      payment.companySubscription.companyId,
      "confirmCompanyPaymentCore"
    );
    return { success: true, data: { companyId: payment.companySubscription.companyId } };
  }

  /**
   * 23 oct. 2026 — offre déjà réglée (accès actif) : ce paiement fait double
   * emploi (ex. carte confirmée par Evolia après annulation, puis virement).
   * L'admin ne peut pas le valider ; une confirmation d'Evolia (argent reçu)
   * est enregistrée mais signalée comme double paiement, sans rien réactiver.
   */
  if (payment.companySubscription.status === "ACTIVE") {
    if (actorId) {
      return {
        success: false,
        error:
          "L'offre de cette entreprise est déjà réglée (accès actif) : ce paiement fait double emploi. Refusez-le, et remboursez-le si l'argent a été reçu.",
      };
    }
    const { count } = await prisma.companyPayment.updateMany({
      where: { id: companyPaymentId, status: "PENDING" },
      data: {
        status: "CONFIRMED",
        reviewedAt: now,
        rejectionReason: DOUBLE_PAYMENT_NOTE,
      },
    });
    if (count === 0) return { success: false, error: "Ce paiement a déjà été traité." };
    return {
      success: true,
      data: { companyId: payment.companySubscription.companyId, doublePayment: true },
    };
  }

  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  // Même transaction que pour un supplément : un échec entre les deux écritures
  // laissait un paiement CONFIRMED (donc non rejouable) avec un abonnement
  // resté en PENDING_REVIEW, c'est-à-dire une entreprise payée sans accès.
  // L'activation est conditionnelle : deux confirmations simultanées pour la
  // même entreprise (admin + Evolia) n'activent qu'une fois ; l'autre est
  // annulée (transaction) et repasse par le contrôle « déjà réglée » ci-dessus.
  const confirmed = await prisma
    .$transaction(async (tx) => {
      const { count } = await tx.companyPayment.updateMany({
        where: { id: companyPaymentId, status: "PENDING" },
        data: { status: "CONFIRMED", reviewedById: actorId, reviewedAt: now },
      });
      if (count === 0) return "processed" as const;
      const activated = await tx.companySubscription.updateMany({
        where: { id: payment.companySubscriptionId, status: { not: "ACTIVE" } },
        data: { status: "ACTIVE", startDate: now, endDate: oneYearLater },
      });
      if (activated.count === 0) throw new AlreadyActiveError();
      return "confirmed" as const;
    })
    .catch((err) => {
      if (err instanceof AlreadyActiveError) return "already-active" as const;
      throw err;
    });
  if (confirmed === "processed") {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }
  if (confirmed === "already-active") {
    return {
      success: false,
      error:
        "L'offre de cette entreprise vient d'être réglée par un autre paiement : réessayez pour le voir.",
    };
  }

  // Module 21 §3.0 étape 3 (8 oct. 2026) — l'offre liée à un événement vaut
  // inscription : les membres sont inscrits après les notifications ci-dessous
  // (`autoRegisterCompanyMembers`), le gérant ajuste ensuite la liste.

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "company_payment.confirm",
        targetType: "CompanyPayment",
        targetId: companyPaymentId,
      },
    });
  }

  const companyAdmin = payment.companySubscription.company.companyAdmin;
  if (companyAdmin) {
    try {
      const email = await resolveEmail("company-payment-confirmed", {
        adminName: companyAdmin.name,
        companyName: payment.companySubscription.company.name,
        // Après connexion, le gérant arrive directement sur la liste des participants.
        loginUrl: `${process.env.NEXTAUTH_URL}/login?callbackUrl=${encodeURIComponent(
          `/entreprises/${payment.companySubscription.companyId}?tab=gestion`
        )}`,
      });
      if (email) await sendTransactionalEmail({ to: companyAdmin.email, ...email });
    } catch (err) {
      // Le paiement est déjà confirmé et l'abonnement déjà actif à ce
      // stade — un échec d'envoi ne doit pas faire échouer l'action.
      console.error("[confirmCompanyPaymentCore] failed to send confirmation email", err);
    }

    if (companyAdmin.phone) {
      try {
        await sendSms(
          companyAdmin.phone,
          `CEO Summit — le paiement de ${payment.companySubscription.company.name} est confirmé. Accès activé.`
        );
      } catch (err) {
        console.error("[confirmCompanyPaymentCore] failed to send confirmation SMS", err);
      }
    }
  }

  await notifyEvolia(payment, false);
  await autoRegisterCompanyMembers(
    payment.companySubscription.companyId,
    "confirmCompanyPaymentCore"
  );
  return { success: true, data: { companyId: payment.companySubscription.companyId } };
}

/**
 * Intégration Evolia (conception/11 §3) — après confirmation d'un paiement :
 * - virement ou chèque : Evolia n'a rien encaissé, l'inscription lui est
 *   transmise pour information à ce moment-là (une carte ou un Mobile Money
 *   l'a déjà été au lancement du paiement, `startEvoliaPayment`) ;
 * - supplément : si le gérant a déjà validé sa liste, elle est renvoyée avec
 *   la nouvelle capacité totale.
 * Les échecs sont journalisés (`EvoliaPush`) sans faire échouer la confirmation.
 */
async function notifyEvolia(
  payment: {
    id: string;
    method: PaymentMethod;
    companySubscription: { companyId: string; participantsValidatedAt: Date | null };
  },
  isUpsell: boolean
) {
  if (!isEvoliaPaymentMethod(payment.method)) await pushRegistrationToEvolia(payment.id);
  if (isUpsell && payment.companySubscription.participantsValidatedAt) {
    await pushParticipantsToEvolia(payment.companySubscription.companyId);
  }
}

export async function confirmEventRegistrationPaymentCore(
  registrationId: string,
  actorId: string | null
): Promise<ActionResult> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: true },
  });
  if (!registration) return { success: false, error: "Inscription introuvable." };

  const { count } = await prisma.eventRegistration.updateMany({
    where: { id: registrationId, paymentStatus: "PENDING" },
    data: { status: "CONFIRMED", paymentStatus: "PAID" },
  });
  if (count === 0) {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "event_registration.confirm_payment",
        targetType: "EventRegistration",
        targetId: registrationId,
      },
    });
  }

  try {
    const email = await resolveEmail("event-registration", {
      memberName: registration.user.name,
      eventTitle: registration.event.title,
      eventDateLabel: formatDateFr(registration.event.date, registration.event.timezone),
      eventLocation: registration.event.isOnline ? "En ligne" : registration.event.location,
    });
    if (email) await sendTransactionalEmail({ to: registration.user.email, ...email });
  } catch (err) {
    console.error("[confirmEventRegistrationPaymentCore] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}

/**
 * Evolia confirme un paiement que le gérant avait annulé pour changer de mode
 * de paiement : il a bien payé, on ne doit pas le priver de son accès.
 * - `revived` : le paiement redevient en attente, la confirmation normale suit ;
 * - `already-paid` : l'offre avait entre-temps été réglée autrement (virement
 *   validé) — le paiement est enregistré comme confirmé sans toucher à
 *   l'abonnement, et signalé pour remboursement (double paiement) ;
 * - `none` : paiement non concerné.
 */
/**
 * 21 oct. 2026 — annule un paiement carte / Mobile Money encore en attente
 * chez Evolia : à la demande du gérant (changement de mode de paiement) ou
 * sur `payment.failed` d'Evolia. Une offre initiale repasse en attente de
 * paiement, l'entreprise retrouve l'étape Paiement ; un supplément reste tel
 * quel. Une confirmation tardive d'Evolia reste honorée
 * (`reviveCancelledEvoliaPayment`). Renvoie `false` si le paiement n'était
 * plus en attente.
 */
export async function cancelPendingEvoliaPaymentCore(
  payment: {
    id: string;
    method: PaymentMethod;
    upsellQuantity: number | null;
    companySubscriptionId: string;
  },
  reason: string,
  actorId: string | null
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.companyPayment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "REJECTED", reviewedAt: new Date(), rejectionReason: reason },
    });
    if (count === 0) return false;
    if (payment.upsellQuantity == null) {
      await tx.companySubscription.updateMany({
        where: { id: payment.companySubscriptionId, status: "PENDING_REVIEW" },
        data: { status: "PENDING_PAYMENT" },
      });
    }
    // Sans auteur (webhook Evolia), la trace reste dans WebhookLog.
    if (actorId) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: "company_payment.cancel_by_company",
          targetType: "CompanyPayment",
          targetId: payment.id,
          metadata: { method: payment.method, upsell: payment.upsellQuantity != null },
        },
      });
    }
    return true;
  });
}

/**
 * 23 oct. 2026 — un paiement Evolia confirmé après annulation porte sur ce que
 * l'entreprise avait choisi à ce moment-là (instantané de l'inscription
 * envoyée à Evolia). Si elle a depuis changé d'offre ou de nombre de
 * participants, l'activer donnerait ce qu'elle n'a pas payé. Renvoie l'écart
 * à faire vérifier par l'admin, ou `null` si tout correspond.
 */
export async function evoliaPaymentMismatch(companyPaymentId: string): Promise<string | null> {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: { companySubscription: { include: { plan: true } } },
  });
  // Supplément : il porte sa propre offre et sa quantité, l'abonnement n'y change rien.
  if (!payment || payment.upsellQuantity != null) return null;
  const push = await prisma.evoliaPush.findFirst({
    where: { reference: companyPaymentId, event: "company.registration.pushed" },
    orderBy: { createdAt: "asc" },
    select: { payload: true },
  });
  if (!push) return null;
  const offer =
    (push.payload as { offer?: { name?: string; includedParticipants?: number | null } }).offer ??
    {};
  const subscription = payment.companySubscription;
  const currentSeats = seatCap(subscription);
  if (
    offer.name === subscription.plan.name &&
    (offer.includedParticipants ?? null) === currentSeats
  ) {
    return null;
  }
  return `Payé : ${offer.name ?? "?"} (${offer.includedParticipants ?? "—"} participant(s)) ; choisi aujourd'hui : ${subscription.plan.name} (${currentSeats ?? "—"} participant(s)).`;
}

/**
 * Paiement Evolia ressuscité mais qui ne correspond plus à l'abonnement
 * (`evoliaPaymentMismatch`) : il reste en attente avec une note, et
 * l'abonnement passe en vérification pour que l'admin le voie et que
 * l'entreprise ne paie pas une seconde fois entre-temps.
 */
export async function holdRevivedPaymentForReview(companyPaymentId: string, mismatch: string) {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    select: { comment: true, companySubscriptionId: true },
  });
  if (!payment) return;
  const note = `[À vérifier] Confirmé par Evolia après annulation, alors que l'entreprise a changé d'offre ou d'effectif. ${mismatch}`;
  await prisma.$transaction([
    prisma.companyPayment.update({
      where: { id: companyPaymentId },
      data: {
        comment: payment.comment
          ? `${note}

${payment.comment}`
          : note,
      },
    }),
    prisma.companySubscription.updateMany({
      where: { id: payment.companySubscriptionId, status: "PENDING_PAYMENT" },
      data: { status: "PENDING_REVIEW" },
    }),
  ]);
}

export async function reviveCancelledEvoliaPayment(
  companyPaymentId: string
): Promise<"none" | "revived" | "already-paid"> {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    select: {
      status: true,
      rejectionReason: true,
      upsellQuantity: true,
      createdAt: true,
      companySubscriptionId: true,
    },
  });
  if (
    !payment ||
    payment.status !== "REJECTED" ||
    !REVIVABLE_EVOLIA_REASONS.includes(payment.rejectionReason ?? "")
  ) {
    return "none";
  }

  if (payment.upsellQuantity == null) {
    const paidOtherwise = await prisma.companyPayment.findFirst({
      where: {
        companySubscriptionId: payment.companySubscriptionId,
        status: "CONFIRMED",
        upsellQuantity: null,
        createdAt: { gt: payment.createdAt },
      },
      select: { id: true },
    });
    if (paidOtherwise) {
      await prisma.companyPayment.updateMany({
        where: { id: companyPaymentId, status: "REJECTED" },
        data: {
          status: "CONFIRMED",
          reviewedAt: new Date(),
          rejectionReason: `Confirmé par Evolia après annulation, alors que l'offre était déjà réglée (paiement ${paidOtherwise.id}) — double paiement à rembourser.`,
        },
      });
      return "already-paid";
    }
  }

  await prisma.companyPayment.updateMany({
    where: { id: companyPaymentId, status: "REJECTED" },
    data: { status: "PENDING", reviewedAt: null, rejectionReason: null },
  });
  return "revived";
}
