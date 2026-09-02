"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import OpportunityApprovedEmail from "@/emails/opportunity-approved-email";
import OpportunityChangesRequestedEmail from "@/emails/opportunity-changes-requested-email";
import OpportunityRefusedEmail from "@/emails/opportunity-refused-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const freeTextSchema = z.string().trim().min(1).max(2000);
const noteSchema = z.string().trim().max(5000);

async function loadPendingOpportunity(opportunityId: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { author: { select: { email: true } } },
  });
  if (!opportunity) {
    return { ok: false as const, error: "Opportunité introuvable." };
  }
  if (opportunity.status !== "PENDING_MODERATION") {
    return { ok: false as const, error: "Cette opportunité n'est plus en attente de modération." };
  }
  return { ok: true as const, opportunity };
}

/** E8-T06 — "Valider et publier". */
export async function approveOpportunity(opportunityId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("deal-room");

  const loaded = await loadPendingOpportunity(opportunityId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { opportunity } = loaded;

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { status: "PUBLISHED", moderatedById: adminId, moderatedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "opportunity.approve",
      targetType: "Opportunity",
      targetId: opportunityId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: opportunity.author.email,
      subject: `Votre opportunité "${opportunity.title}" est publiée`,
      react: OpportunityApprovedEmail({
        opportunityTitle: opportunity.title,
        opportunityUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/deal-room/${opportunityId}`,
      }),
    });
  } catch (err) {
    // La publication et l'audit log sont déjà commités à ce stade — un
    // échec d'envoi ne doit pas faire échouer l'approbation (audit du 7
    // août, "pattern try/catch email admin appliqué de façon inégale").
    console.error("[approveOpportunity] failed to send approval email", err);
  }

  revalidatePath("/admin/deal-room");
  revalidatePath("/deal-room");
  return { success: true, data: undefined };
}

/** E8-T06 — "Demander des modifications" : message libre envoyé à l'auteur. */
export async function requestOpportunityChanges(
  opportunityId: string,
  message: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("deal-room");
  const parsed = freeTextSchema.safeParse(message);
  if (!parsed.success) return { success: false, error: "Le message est requis." };
  message = parsed.data;

  const loaded = await loadPendingOpportunity(opportunityId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { opportunity } = loaded;

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { status: "CHANGES_REQUESTED", moderatedById: adminId, moderatedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "opportunity.request_changes",
      targetType: "Opportunity",
      targetId: opportunityId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: opportunity.author.email,
      subject: `Modifications demandées — ${opportunity.title}`,
      react: OpportunityChangesRequestedEmail({ opportunityTitle: opportunity.title, message }),
    });
  } catch (err) {
    console.error("[requestOpportunityChanges] failed to send changes-requested email", err);
  }

  revalidatePath("/admin/deal-room");
  return { success: true, data: undefined };
}

/** E8-T06 — "Refuser la publication" : motif envoyé au membre (différent de RG-07 candidatures). */
export async function rejectOpportunity(
  opportunityId: string,
  reason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("deal-room");
  const parsed = freeTextSchema.safeParse(reason);
  if (!parsed.success) return { success: false, error: "Le motif est requis." };
  reason = parsed.data;

  const loaded = await loadPendingOpportunity(opportunityId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { opportunity } = loaded;

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { status: "REFUSED", moderatedById: adminId, moderatedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "opportunity.reject",
      targetType: "Opportunity",
      targetId: opportunityId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: opportunity.author.email,
      subject: `Votre opportunité "${opportunity.title}" n'a pas été retenue`,
      react: OpportunityRefusedEmail({ opportunityTitle: opportunity.title, reason }),
    });
  } catch (err) {
    console.error("[rejectOpportunity] failed to send refusal email", err);
  }

  revalidatePath("/admin/deal-room");
  return { success: true, data: undefined };
}

/** E8-T06 — "Dépublication opportunités actives". */
export async function unpublishOpportunity(opportunityId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("deal-room");

  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) return { success: false, error: "Opportunité introuvable." };
  if (opportunity.status !== "PUBLISHED") {
    return { success: false, error: "Seule une opportunité active peut être dépubliée." };
  }

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { status: "UNPUBLISHED" },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "opportunity.unpublish",
      targetType: "Opportunity",
      targetId: opportunityId,
    },
  });

  revalidatePath("/admin/deal-room");
  revalidatePath("/deal-room");
  return { success: true, data: undefined };
}

export async function republishOpportunity(opportunityId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("deal-room");

  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) return { success: false, error: "Opportunité introuvable." };
  if (opportunity.status !== "UNPUBLISHED") {
    return { success: false, error: "Seule une opportunité dépubliée peut être republiée." };
  }

  await prisma.opportunity.update({ where: { id: opportunityId }, data: { status: "PUBLISHED" } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "opportunity.republish",
      targetType: "Opportunity",
      targetId: opportunityId,
    },
  });

  revalidatePath("/admin/deal-room");
  revalidatePath("/deal-room");
  return { success: true, data: undefined };
}

/** Note de modération — usage interne admin uniquement, jamais envoyée au membre. */
export async function saveModerationNote(
  opportunityId: string,
  note: string
): Promise<ActionResult> {
  await requireAdmin("deal-room");
  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return { success: false, error: "Note invalide." };

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { moderationNote: parsed.data || null },
  });

  revalidatePath(`/admin/deal-room/${opportunityId}`);
  return { success: true, data: undefined };
}
