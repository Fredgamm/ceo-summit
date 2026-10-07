"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { seatCap } from "@/lib/company-seats";
import {
  activeEventOf,
  registerCompanyMemberToEvent,
  sendEventRegistrationEmail,
} from "@/lib/event-participation";
import { pushParticipantsToEvolia } from "@/lib/evolia";

type ActionResult<T = undefined> =
  { success: true; data: T; warning?: string } | { success: false; error: string };

const participantIdsSchema = z.array(z.string().min(1)).max(500);

/**
 * Module 18 §4.9 — le gérant désigne, parmi les comptes actifs de son
 * entreprise, qui participe à l'événement de l'offre, dans la limite des
 * places. Valider la liste inscrit les nouveaux participants (email de
 * confirmation), désinscrit ceux qui en sont retirés, et transmet la liste
 * complète à Evolia (`company.participants.confirmed`).
 */
export async function validateEventParticipants(
  companyId: string,
  participantIds: unknown
): Promise<ActionResult<{ registered: number; removed: number }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsedIds = participantIdsSchema.safeParse(participantIds);
  if (!parsedIds.success) return { success: false, error: "Liste de participants invalide." };
  const selectedIds = [...new Set(parsedIds.data)];

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      subscription: { include: { plan: { include: { event: true } } } },
      users: { where: { status: "ACTIVE" }, select: { id: true, name: true, email: true } },
    },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul le gérant de l'entreprise peut valider la liste." };
  }

  const activeEvent = activeEventOf(company.subscription);
  if (!activeEvent || !company.subscription) {
    return {
      success: false,
      error: "Votre offre n'est rattachée à aucun événement à venir, ou n'est pas encore active.",
    };
  }

  const members = new Map(company.users.map((u) => [u.id, u]));
  if (selectedIds.some((id) => !members.has(id))) {
    return { success: false, error: "Un des participants ne fait pas partie de votre entreprise." };
  }

  const cap = seatCap(company.subscription);
  if (cap != null && selectedIds.length > cap) {
    return {
      success: false,
      error: `Votre offre compte ${cap} place(s) : retirez des participants, ou achetez des places supplémentaires.`,
    };
  }

  // Comptes de l'entreprise déjà inscrits, pour savoir qui retirer.
  const currentRegistrations = await prisma.eventRegistration.findMany({
    where: {
      eventId: activeEvent.eventId,
      userId: { in: [...members.keys()] },
      status: { not: "CANCELLED" },
    },
    select: { userId: true },
  });
  const removedIds = currentRegistrations
    .map((r) => r.userId)
    .filter((id) => !selectedIds.includes(id));

  if (removedIds.length > 0) {
    await prisma.eventRegistration.updateMany({
      where: { eventId: activeEvent.eventId, userId: { in: removedIds } },
      data: { status: "CANCELLED" },
    });
  }

  let registered = 0;
  const full: string[] = [];
  for (const userId of selectedIds) {
    const outcome = await registerCompanyMemberToEvent(
      userId,
      activeEvent.eventId,
      activeEvent.planId
    );
    if (!outcome) {
      full.push(members.get(userId)!.name);
      continue;
    }
    if (!outcome.wasConfirmed) {
      registered++;
      await sendEventRegistrationEmail(
        members.get(userId)!,
        outcome.event,
        "validateEventParticipants"
      );
    }
  }

  await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      // Le gérant n'occupe une place que s'il participe (`countUsedSeats`).
      data: { adminParticipates: selectedIds.includes(viewer.id) },
    }),
    prisma.companySubscription.update({
      where: { id: company.subscription.id },
      data: { participantsValidatedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: viewer.id,
        action: "company.participants.validate",
        targetType: "Company",
        targetId: companyId,
        metadata: {
          eventId: activeEvent.eventId,
          participants: selectedIds.length,
          removed: removedIds.length,
        },
      },
    }),
  ]);

  // Un échec d'envoi vers Evolia ne bloque pas la validation : il est journalisé
  // (EvoliaPush) et l'admin peut relancer.
  await pushParticipantsToEvolia(companyId);

  revalidatePath(`/entreprises/${companyId}`);
  return {
    success: true,
    data: { registered, removed: removedIds.length },
    ...(full.length > 0
      ? {
          warning: `L'événement est complet : ${full.join(", ")} n'a pas pu être inscrit(e). Contactez l'équipe CEO Summit.`,
        }
      : {}),
  };
}
