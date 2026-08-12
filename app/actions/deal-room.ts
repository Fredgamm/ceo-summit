"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { opportunityFormSchema } from "@/lib/validations/opportunity";
import { withCreditDeductionLock, CreditDeductionLockBusyError } from "@/lib/credit-deduction-lock";
import { getOrCreateConversation } from "@/lib/conversations";
import { allowedVisibilities } from "@/lib/deal-room-query";
import { getDealRoomContactCost } from "@/lib/deal-room-settings";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import { requireViewer } from "@/lib/require-viewer";
import { sendTransactionalEmail } from "@/lib/resend";
import AdminOpportunityAlertEmail from "@/emails/admin-opportunity-alert-email";
import OpportunityContactRequestEmail from "@/emails/opportunity-contact-request-email";

type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string; code?: "INSUFFICIENT_CREDITS" };

class InsufficientCreditsError extends Error {}
class ContactAlreadyHandledError extends Error {}

/** E6-T03 — publication (gratuite, statut pending_moderation → email admin). */
export async function publishOpportunity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsed = opportunityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  const opportunity = await prisma.opportunity.create({
    data: {
      authorId: viewer.id,
      title: f.title,
      type: f.type,
      sector: f.sector,
      country: f.country,
      description: f.description,
      budget: f.budget.trim() ? parseInt(f.budget, 10) : null,
      deadline: f.deadline.trim() ? new Date(f.deadline) : null,
      visibility: f.visibility,
      attachments: f.attachments,
      status: "PENDING_MODERATION",
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Nouvelle opportunité à modérer — ${opportunity.title}`,
        react: AdminOpportunityAlertEmail({
          authorName: viewer.name,
          opportunityTitle: opportunity.title,
        }),
      });
    } catch (err) {
      // L'opportunité est déjà créée à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer la publication (même bug
      // de classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[publishOpportunity] failed to send admin alert email", err);
    }
  }

  revalidatePath("/deal-room");
  return { success: true, data: { id: opportunity.id } };
}

/**
 * E6-T02/E6-T04 — "Prendre contact" : déduction atomique de 1 crédit
 * (transaction Prisma) sous verrou Redis (anti double-clic / requêtes
 * concurrentes), bypass total pour Chairman.
 */
export async function contactOpportunityAuthor(opportunityId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { author: { select: { email: true } } },
  });

  if (!opportunity || opportunity.status !== "PUBLISHED") {
    return { success: false, error: "Cette opportunité n'est pas disponible." };
  }
  if (opportunity.authorId === viewer.id) {
    return { success: false, error: "Vous ne pouvez pas contacter votre propre opportunité." };
  }
  /**
   * Correctif (7 août 2026, audit) — cette action ne vérifiait jamais le
   * tier du viewer face à `opportunity.visibility`, contrairement à la
   * page détail (`app/deal-room/[id]/page.tsx:62`, qui commente
   * explicitement "défense en profondeur — une URL directe ne doit pas
   * contourner le gate de tier") et à la requête de liste. Un membre
   * MEMBER en connaissant l'id pouvait donc contacter l'auteur d'une
   * opportunité réservée EXECUTIVE/CHAIRMAN et dépenser un crédit pour ça.
   */
  const viewerTier = getViewerTierFromCompany(viewer.company);
  if (!allowedVisibilities(viewerTier).includes(opportunity.visibility)) {
    return { success: false, error: "Cette opportunité n'est pas disponible." };
  }

  const existing = await prisma.opportunityContact.findUnique({
    where: { opportunityId_initiatorId: { opportunityId, initiatorId: viewer.id } },
  });
  if (existing) {
    return { success: false, error: "Vous avez déjà pris contact pour cette opportunité." };
  }

  const isChairman = viewerTier === "CHAIRMAN";
  /**
   * Coût configurable (7 août 2026, demande admin) — un admin peut le
   * mettre à 0 depuis /admin/parametres pour rendre le contact gratuit pour
   * tout le monde, sans toucher au code. Chairman reste de toute façon
   * toujours gratuit, indépendamment de ce réglage.
   */
  const contactCost = await getDealRoomContactCost();
  const shouldCharge = !isChairman && contactCost > 0;

  try {
    await withCreditDeductionLock(viewer.id, () =>
      prisma.$transaction(async (tx) => {
        if (shouldCharge) {
          const balance = await tx.creditBalance.findUnique({ where: { userId: viewer.id } });
          const available = balance ? balance.included + balance.purchased - balance.used : 0;
          if (available < contactCost) {
            throw new InsufficientCreditsError();
          }
          await tx.creditBalance.update({
            where: { userId: viewer.id },
            data: { used: { increment: contactCost } },
          });
          await tx.creditTransaction.create({
            data: {
              userId: viewer.id,
              amount: -contactCost,
              type: "DEDUCTION",
              reason: `Contact — ${opportunity.title}`,
            },
          });
        }

        await tx.opportunityContact.create({
          data: {
            opportunityId,
            initiatorId: viewer.id,
            receiverId: opportunity.authorId,
            creditsSpent: shouldCharge ? contactCost : 0,
          },
        });
      })
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return {
        success: false,
        error: "Solde de crédits insuffisant.",
        code: "INSUFFICIENT_CREDITS",
      };
    }
    if (err instanceof CreditDeductionLockBusyError) {
      return { success: false, error: err.message };
    }
    throw err;
  }

  try {
    await sendTransactionalEmail({
      to: opportunity.author.email,
      subject: `Nouvelle demande de contact — ${opportunity.title}`,
      react: OpportunityContactRequestEmail({
        initiatorName: viewer.name,
        opportunityTitle: opportunity.title,
        opportunityUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/deal-room/${opportunityId}`,
      }),
    });
  } catch (err) {
    // Le crédit est déjà débité et le contact déjà créé à ce stade — un
    // échec d'envoi de la notification à l'auteur ne doit pas faire
    // échouer l'action (même bug de classe que celui corrigé sur
    // signup() le 1er août 2026, et sur publishOpportunity le 7 août).
    console.error("[contactOpportunityAuthor] failed to send notification email", err);
  }

  revalidatePath(`/deal-room/${opportunityId}`);
  return { success: true, data: undefined };
}

/**
 * E7-T04 — "À l'acceptation d'un contact Deal Room → création automatique
 * de la conversation." Only the receiver (opportunity author) may decide.
 */
export async function acceptOpportunityContact(
  contactId: string
): Promise<ActionResult<{ conversationId: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: { opportunity: { select: { id: true, title: true } } },
  });
  if (!contact || contact.receiverId !== viewer.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  const conversation = await getOrCreateConversation(
    contact.initiatorId,
    contact.receiverId,
    contact.opportunityId
  );
  await prisma.opportunityContact.update({
    where: { id: contactId },
    data: { status: "ACCEPTED", conversationId: conversation.id },
  });

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: { conversationId: conversation.id } };
}

/**
 * Sprint de correction (5 août 2026, EX-T01) — le crédit dépensé par
 * l'initiateur pour "prendre contact" n'était jamais remboursé si la
 * demande n'aboutissait pas (déclinée, ou retirée par l'initiateur
 * lui-même faute de réponse — voir withdrawOpportunityContact). Partagé
 * entre les deux, seule la vérification d'autorisation diffère à l'appel.
 *
 * Correctif (7 août 2026, audit) — la vérification `status !== "PENDING"`
 * se faisait chez l'appelant, sur une lecture antérieure à la transaction,
 * et l'`update` ici n'était pas conditionné sur le statut : deux appels
 * concurrents (double-clic, ou refus et retrait au même instant) passaient
 * tous deux la vérification obsolète et remboursaient tous les deux le
 * même crédit déjà dépensé. Verrouillé comme la dépense elle-même
 * (`withCreditDeductionLock`, même clé par utilisateur) et le passage à
 * `DECLINED` est désormais conditionné sur `status: "PENDING"` dans la
 * transaction — un second appel concurrent trouve 0 ligne mise à jour et
 * lève `ContactAlreadyHandledError` au lieu de rembourser une seconde fois.
 */
async function refundAndDeclineContact(contact: {
  id: string;
  initiatorId: string;
  creditsSpent: number;
  opportunity: { title: string };
}): Promise<void> {
  await withCreditDeductionLock(contact.initiatorId, () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.opportunityContact.updateMany({
        where: { id: contact.id, status: "PENDING" },
        data: { status: "DECLINED" },
      });
      if (count === 0) {
        throw new ContactAlreadyHandledError();
      }
      if (contact.creditsSpent > 0) {
        await tx.creditBalance.update({
          where: { userId: contact.initiatorId },
          data: { used: { decrement: contact.creditsSpent } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: contact.initiatorId,
            amount: contact.creditsSpent,
            type: "REFUND",
            reason: `Remboursement — contact non abouti (${contact.opportunity.title})`,
          },
        });
      }
    })
  );
}

export async function declineOpportunityContact(contactId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: { opportunity: { select: { title: true } } },
  });
  if (!contact || contact.receiverId !== viewer.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  try {
    await refundAndDeclineContact(contact);
  } catch (err) {
    if (err instanceof ContactAlreadyHandledError) {
      return { success: false, error: "Cette demande a déjà été traitée." };
    }
    if (err instanceof CreditDeductionLockBusyError) {
      return { success: false, error: err.message };
    }
    throw err;
  }

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: undefined };
}

/**
 * Sprint de correction (5 août 2026, EX-T01) — l'initiateur d'une demande de
 * contact restée sans réponse n'avait auparavant aucun moyen d'agir : ni
 * récupérer son crédit, ni relancer ailleurs. Il peut désormais retirer
 * lui-même sa demande, ce qui la clôt et rembourse le crédit dépensé —
 * couvre le cas "jamais répondu" sans nécessiter de tâche planifiée
 * (aucune infra de cron dans ce projet, voir BACKLOG_DEV.md).
 */
export async function withdrawOpportunityContact(contactId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: { opportunity: { select: { title: true } } },
  });
  if (!contact || contact.initiatorId !== viewer.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  try {
    await refundAndDeclineContact(contact);
  } catch (err) {
    if (err instanceof ContactAlreadyHandledError) {
      return { success: false, error: "Cette demande a déjà été traitée." };
    }
    if (err instanceof CreditDeductionLockBusyError) {
      return { success: false, error: err.message };
    }
    throw err;
  }

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: undefined };
}

/**
 * Sprint de correction (5 août 2026, EX-T01) — une opportunité refusée ou
 * "modifications demandées" par la modération n'avait auparavant aucun
 * chemin de retour : l'auteur ne pouvait ni la corriger ni la resoumettre.
 * Repasse par la même validation que la publication initiale et revient en
 * `PENDING_MODERATION`, note de modération remise à zéro.
 */
export async function resubmitOpportunity(
  opportunityId: string,
  input: unknown
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity || opportunity.authorId !== viewer.id) {
    return { success: false, error: "Opportunité introuvable." };
  }
  if (opportunity.status !== "REFUSED" && opportunity.status !== "CHANGES_REQUESTED") {
    return {
      success: false,
      error: "Seule une opportunité refusée ou à modifier peut être resoumise.",
    };
  }

  const parsed = opportunityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      title: f.title,
      type: f.type,
      sector: f.sector,
      country: f.country,
      description: f.description,
      budget: f.budget.trim() ? parseInt(f.budget, 10) : null,
      deadline: f.deadline.trim() ? new Date(f.deadline) : null,
      visibility: f.visibility,
      attachments: f.attachments,
      status: "PENDING_MODERATION",
      moderationNote: null,
      moderatedById: null,
      moderatedAt: null,
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Opportunité resoumise à modérer — ${f.title}`,
        react: AdminOpportunityAlertEmail({ authorName: viewer.name, opportunityTitle: f.title }),
      });
    } catch (err) {
      console.error("[resubmitOpportunity] failed to send admin alert email", err);
    }
  }

  revalidatePath(`/deal-room/${opportunityId}`);
  revalidatePath("/deal-room");
  return { success: true, data: undefined };
}
