"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { opportunityFormSchema } from "@/lib/validations/opportunity";
import { withCreditDeductionLock, CreditDeductionLockBusyError } from "@/lib/credit-deduction-lock";
import { sendTransactionalEmail } from "@/lib/resend";
import AdminOpportunityAlertEmail from "@/emails/admin-opportunity-alert-email";

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
    prisma.opportunity.findUnique({ where: { id: opportunityId } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
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

  const isChairman = viewer.memberships[0]?.tier === "CHAIRMAN";

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

  revalidatePath(`/deal-room/${opportunityId}`);
  return { success: true, data: undefined };
}
