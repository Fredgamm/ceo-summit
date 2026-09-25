import { prisma } from "@/lib/prisma";
import { withEventRegistrationLock } from "@/lib/event-registration-lock";
import { sendTransactionalEmail } from "@/lib/resend";
import { sendSms } from "@/lib/sms";
import { formatDateFr } from "@/lib/utils";
import { seatCap } from "@/lib/company-seats";
import CompanyPaymentConfirmedEmail from "@/emails/company-payment-confirmed-email";
import CompanyUpsellConfirmedEmail from "@/emails/company-upsell-confirmed-email";
import EventRegistrationEmail from "@/emails/event-registration-email";
import CreditPurchaseConfirmedEmail from "@/emails/credit-purchase-confirmed-email";

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
): Promise<ActionResult<{ companyId: string }>> {
  const payment = await prisma.companyPayment.findUnique({
    where: { id: companyPaymentId },
    include: {
      companySubscription: {
        include: {
          plan: { include: { linkedPlatformPlan: true } },
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
        await sendTransactionalEmail({
          to: upsellCompanyAdmin.email,
          subject: `Supplément confirmé — ${payment.companySubscription.company.name}`,
          react: CompanyUpsellConfirmedEmail({
            adminName: upsellCompanyAdmin.name,
            companyName: payment.companySubscription.company.name,
            planName: payment.upsellPlan.name,
            quantity: payment.upsellQuantity,
          }),
        });
      } catch (err) {
        console.error("[confirmCompanyPaymentCore] failed to send upsell confirmation email", err);
      }
    }

    return { success: true, data: { companyId: payment.companySubscription.companyId } };
  }

  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  const { count } = await prisma.companyPayment.updateMany({
    where: { id: companyPaymentId, status: "PENDING" },
    data: { status: "CONFIRMED", reviewedById: actorId, reviewedAt: now },
  });
  if (count === 0) {
    return { success: false, error: "Ce paiement a déjà été traité." };
  }
  await prisma.companySubscription.update({
    where: { id: payment.companySubscriptionId },
    data: { status: "ACTIVE", startDate: now, endDate: oneYearLater },
  });

  /**
   * Phase 2quater (1er août 2026) — même effet de bord que
   * confirmMembershipPayment, mais pour chaque membre déjà rattaché à
   * l'entreprise au moment de la confirmation (pas les invitations encore
   * en attente) — un collaborateur invité après coup n'est pas
   * rétroactivement inscrit à l'évènement (RG-14 couvre ce cas séparément,
   * à l'acceptation de l'invitation).
   *
   * Correctif (7 août 2026, audit) — sérialisé par
   * `withEventRegistrationLock` et borné à la capacité restante ; les
   * membres au-delà ne sont pas inscrits à l'évènement (mais gardent les
   * avantages plateforme ci-dessous, l'offre étant déjà payée).
   *
   * Audit (25 septembre 2026) — n'inscrit plus que les participants réels :
   * les comptes `ACTIVE` de l'entreprise, sans le gestionnaire s'il n'a pas
   * coché « Je participe » (`conception/12` §3.3 — il était jusqu'ici
   * inscrit d'office, place comprise), et jamais au-delà de `seatCap()`
   * (dans l'ordre de création des comptes, le surplus étant loggué et tracé
   * dans l'audit pour un suivi manuel).
   */
  const plan = payment.companySubscription.plan;
  const company = payment.companySubscription.company;
  let skippedForCapacity = 0;
  let skippedForSeatCap = 0;
  if (plan.eventId) {
    const eventId = plan.eventId;
    const participants = company.users.filter(
      (u) => u.status === "ACTIVE" && (company.adminParticipates || u.id !== company.companyAdminId)
    );
    const cap = seatCap(payment.companySubscription);
    const users = cap != null ? participants.slice(0, cap) : participants;
    skippedForSeatCap = participants.length - users.length;
    if (skippedForSeatCap > 0) {
      console.warn(
        `[confirmCompanyPaymentCore] ${skippedForSeatCap} participant(s) of company ${payment.companySubscription.companyId} not registered to event ${eventId}: seat cap (${cap}) exceeded`
      );
    }
    await withEventRegistrationLock(eventId, async () => {
      const [event, existingRegs, takenSpots] = await Promise.all([
        prisma.event.findUnique({ where: { id: eventId }, select: { capacity: true } }),
        prisma.eventRegistration.findMany({
          where: { eventId, userId: { in: users.map((u) => u.id) } },
          select: { userId: true },
        }),
        prisma.eventRegistration.count({
          where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
        }),
      ]);
      const alreadyRegisteredIds = new Set(existingRegs.map((r) => r.userId));
      const newUserIds = users.map((u) => u.id).filter((id) => !alreadyRegisteredIds.has(id));
      const remainingCapacity = event
        ? Math.max(0, event.capacity - takenSpots)
        : newUserIds.length;
      const admittedIds = new Set(newUserIds.slice(0, remainingCapacity));
      skippedForCapacity = newUserIds.length - admittedIds.size;

      await Promise.all(
        users
          .filter((u) => alreadyRegisteredIds.has(u.id) || admittedIds.has(u.id))
          .map((u) =>
            prisma.eventRegistration.upsert({
              where: { eventId_userId: { eventId, userId: u.id } },
              update: { status: "CONFIRMED", paymentStatus: "PAID", planId: plan.id },
              create: {
                eventId,
                userId: u.id,
                status: "CONFIRMED",
                paymentStatus: "PAID",
                planId: plan.id,
              },
            })
          )
      );
    });
  }

  /**
   * RG-09 (4 août 2026) — les avantages plateforme (crédits Deal Room)
   * viennent de l'offre plateforme liée (`linkedPlatformPlan`), jamais de
   * l'offre d'évènement elle-même ; repli sur l'offre payée directement si
   * aucun lien n'est renseigné.
   */
  const benefitPlan = plan.linkedPlatformPlan ?? plan;
  const includedCredits = benefitPlan.hasUnlimitedCredits ? 999999 : benefitPlan.includedCredits;
  await Promise.all(
    payment.companySubscription.company.users.map((u) =>
      prisma.creditBalance.upsert({
        where: { userId: u.id },
        update: { included: includedCredits, used: 0, resetAt: oneYearLater },
        create: {
          userId: u.id,
          included: includedCredits,
          purchased: 0,
          used: 0,
          resetAt: oneYearLater,
        },
      })
    )
  );

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "company_payment.confirm",
        targetType: "CompanyPayment",
        targetId: companyPaymentId,
        ...(skippedForCapacity > 0 || skippedForSeatCap > 0
          ? {
              metadata: {
                eventId: plan.eventId,
                ...(skippedForCapacity > 0 ? { skippedForEventCapacity: skippedForCapacity } : {}),
                ...(skippedForSeatCap > 0 ? { skippedForSeatCap } : {}),
              },
            }
          : {}),
      },
    });
  }

  const companyAdmin = payment.companySubscription.company.companyAdmin;
  if (companyAdmin) {
    try {
      await sendTransactionalEmail({
        to: companyAdmin.email,
        subject: `Paiement confirmé — ${payment.companySubscription.company.name}`,
        react: CompanyPaymentConfirmedEmail({
          adminName: companyAdmin.name,
          companyName: payment.companySubscription.company.name,
        }),
      });
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

  return { success: true, data: { companyId: payment.companySubscription.companyId } };
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
    await sendTransactionalEmail({
      to: registration.user.email,
      subject: `Paiement confirmé — ${registration.event.title}`,
      react: EventRegistrationEmail({
        memberName: registration.user.name,
        eventTitle: registration.event.title,
        eventDateLabel: formatDateFr(registration.event.date),
        eventLocation: registration.event.isOnline ? "En ligne" : registration.event.location,
        requiresManualValidation: false,
      }),
    });
  } catch (err) {
    console.error("[confirmEventRegistrationPaymentCore] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}

export async function confirmCreditPurchaseCore(
  purchaseId: string,
  actorId: string | null
): Promise<ActionResult> {
  const purchase = await prisma.creditPurchase.findUnique({
    where: { id: purchaseId },
    include: { user: true },
  });
  if (!purchase) return { success: false, error: "Achat introuvable." };

  const { count } = await prisma.creditPurchase.updateMany({
    where: { id: purchaseId, status: "PENDING" },
    data: { status: "CONFIRMED", confirmedById: actorId, confirmedAt: new Date() },
  });
  if (count === 0) {
    return { success: false, error: "Cet achat a déjà été traité." };
  }

  await prisma.$transaction([
    prisma.creditBalance.upsert({
      where: { userId: purchase.userId },
      update: { purchased: { increment: purchase.credits } },
      create: { userId: purchase.userId, included: 0, purchased: purchase.credits, used: 0 },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: purchase.userId,
        amount: purchase.credits,
        type: "PURCHASE",
        reason: `Achat pack ${purchase.credits} crédits`,
      },
    }),
  ]);

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "credit_purchase.confirm",
        targetType: "CreditPurchase",
        targetId: purchaseId,
      },
    });
  }

  try {
    await sendTransactionalEmail({
      to: purchase.user.email,
      subject: "Votre achat de crédits CEO Summit est confirmé",
      react: CreditPurchaseConfirmedEmail({
        memberName: purchase.user.name,
        credits: purchase.credits,
      }),
    });
  } catch (err) {
    console.error("[confirmCreditPurchaseCore] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}
