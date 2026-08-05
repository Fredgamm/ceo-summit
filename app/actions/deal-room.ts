"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { opportunityFormSchema } from "@/lib/validations/opportunity";
import { withCreditDeductionLock, CreditDeductionLockBusyError } from "@/lib/credit-deduction-lock";
import { getOrCreateConversation } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { sendTransactionalEmail } from "@/lib/resend";
import AdminOpportunityAlertEmail from "@/emails/admin-opportunity-alert-email";
import OpportunityContactRequestEmail from "@/emails/opportunity-contact-request-email";

type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string; code?: "INSUFFICIENT_CREDITS" };

class InsufficientCreditsError extends Error {}

/** E6-T03 — publication (gratuite, statut pending_moderation → email admin). */
export async function publishOpportunity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const parsed = opportunityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) return { success: false, error: "Non authentifié." };

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
    await sendTransactionalEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Nouvelle opportunité à modérer — ${opportunity.title}`,
      react: AdminOpportunityAlertEmail({
        authorName: viewer.name,
        opportunityTitle: opportunity.title,
      }),
    });
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
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const [opportunity, viewer] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { author: { select: { email: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: VIEWER_TIER_INCLUDE,
    }),
  ]);

  if (!opportunity || opportunity.status !== "PUBLISHED") {
    return { success: false, error: "Cette opportunité n'est pas disponible." };
  }
  if (!viewer) return { success: false, error: "Non authentifié." };
  if (opportunity.authorId === viewer.id) {
    return { success: false, error: "Vous ne pouvez pas contacter votre propre opportunité." };
  }

  const existing = await prisma.opportunityContact.findUnique({
    where: { opportunityId_initiatorId: { opportunityId, initiatorId: viewer.id } },
  });
  if (existing) {
    return { success: false, error: "Vous avez déjà pris contact pour cette opportunité." };
  }

  const isChairman = getViewerTierFromCompany(viewer.company) === "CHAIRMAN";

  try {
    await withCreditDeductionLock(viewer.id, () =>
      prisma.$transaction(async (tx) => {
        if (!isChairman) {
          const balance = await tx.creditBalance.findUnique({ where: { userId: viewer.id } });
          const available = balance ? balance.included + balance.purchased - balance.used : 0;
          if (available <= 0) {
            throw new InsufficientCreditsError();
          }
          await tx.creditBalance.update({
            where: { userId: viewer.id },
            data: { used: { increment: 1 } },
          });
          await tx.creditTransaction.create({
            data: {
              userId: viewer.id,
              amount: -1,
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
            creditsSpent: isChairman ? 0 : 1,
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

  await sendTransactionalEmail({
    to: opportunity.author.email,
    subject: `Nouvelle demande de contact — ${opportunity.title}`,
    react: OpportunityContactRequestEmail({
      initiatorName: viewer.name,
      opportunityTitle: opportunity.title,
      opportunityUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/deal-room/${opportunityId}`,
    }),
  });

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
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: { opportunity: { select: { id: true, title: true } } },
  });
  if (!contact || contact.receiverId !== session.user.id) {
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

export async function declineOpportunityContact(contactId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const contact = await prisma.opportunityContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.receiverId !== session.user.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  await prisma.opportunityContact.update({
    where: { id: contactId },
    data: { status: "DECLINED" },
  });

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: undefined };
}
