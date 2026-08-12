"use server";

import { revalidatePath } from "next/cache";
import type { EventStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { eventFormSchema } from "@/lib/validations/event";
import { parseSpeakersText } from "@/lib/event-content";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/** E3-T05 — CRUD événements admin. Zoom: pas d'intégration API réelle (pas de clés
 * sandbox) — zoomMeetingId reste un champ texte saisi manuellement, comme pour E3-T02.
 * Emails automatiques J-7/J-1 : pas d'infra de tâche planifiée dans ce projet
 * (aucun cron), donc pas construits — ce serait EX-T03 (monitoring/infra), qui n'existe
 * pas non plus.
 */
function toEventData(
  input: unknown
): { error: string } | { data: Prisma.EventUncheckedCreateInput } {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  return {
    data: {
      title: f.title,
      type: f.type,
      description: f.description,
      speakers: parseSpeakersText(f.speakersText) as unknown as Prisma.InputJsonValue,
      location: f.location,
      isOnline: f.isOnline,
      zoomMeetingId: f.zoomMeetingId || null,
      date: new Date(f.date),
      capacity: f.capacity,
      minTier: f.minTier,
      price: f.price,
      imageUrl: f.imageUrl || null,
    },
  };
}

export async function createEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { userId: adminId } = await requireAdmin("evenements");

  const result = toEventData(input);
  if ("error" in result) return { success: false, error: result.error };

  const event = await prisma.event.create({ data: { ...result.data, status: "DRAFT" } });

  await prisma.auditLog.create({
    data: { actorId: adminId, action: "event.create", targetType: "Event", targetId: event.id },
  });

  revalidatePath("/admin/evenements");
  return { success: true, data: { id: event.id } };
}

export async function updateEvent(eventId: string, input: unknown): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("evenements");

  const result = toEventData(input);
  if ("error" in result) return { success: false, error: result.error };

  await prisma.event.update({ where: { id: eventId }, data: result.data });

  await prisma.auditLog.create({
    data: { actorId: adminId, action: "event.update", targetType: "Event", targetId: eventId },
  });

  revalidatePath("/admin/evenements");
  revalidatePath(`/admin/evenements/${eventId}`);
  return { success: true, data: undefined };
}

export async function setEventStatus(eventId: string, status: EventStatus): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("evenements");

  await prisma.event.update({ where: { id: eventId }, data: { status } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "event.set_status",
      targetType: "Event",
      targetId: eventId,
      metadata: { status },
    },
  });

  revalidatePath("/admin/evenements");
  revalidatePath(`/admin/evenements/${eventId}`);
  return { success: true, data: undefined };
}

/**
 * E3-T04 — check-in. `code` is validated the same way whether it was typed,
 * pasted, or decoded from a camera scan (see components/admin/
 * checkin-scanner.tsx, camera scan added 5 août 2026) — this action only
 * ever sees the resulting string, matched against `EventRegistration.
 * badgeQrCode`. Only a CONFIRMED registration (paid or included) can be
 * checked in, matching the wireframe's disabled "—" for pending-payment
 * rows.
 */
export async function checkInRegistration(
  eventId: string,
  code: string,
  checkpointId?: string | null
): Promise<ActionResult<{ name: string; alreadyCheckedIn: boolean }>> {
  await requireAdmin("evenements");

  const registration = await prisma.eventRegistration.findUnique({
    where: { badgeQrCode: code.trim() },
    include: { user: { select: { name: true } } },
  });

  if (!registration || registration.eventId !== eventId) {
    return { success: false, error: "Code de badge invalide pour cet événement." };
  }
  if (registration.status !== "CONFIRMED") {
    return {
      success: false,
      error: "Cette inscription n'est pas confirmée (paiement en attente).",
    };
  }
  if (registration.checkedIn) {
    return { success: true, data: { name: registration.user.name, alreadyCheckedIn: true } };
  }

  /**
   * Contrôle d'accès multi-points (7 août 2026) — `checkpointId` est
   * optionnel (compatibilité avec un évènement sans poste configuré) mais,
   * fourni, doit appartenir à cet évènement précis — sinon un poste d'un
   * autre évènement pourrait être enregistré par erreur/malveillance.
   */
  if (checkpointId) {
    const checkpoint = await prisma.eventCheckpoint.findUnique({ where: { id: checkpointId } });
    if (!checkpoint || checkpoint.eventId !== eventId) {
      return { success: false, error: "Poste de contrôle invalide pour cet évènement." };
    }
  }

  await prisma.eventRegistration.update({
    where: { id: registration.id },
    data: { checkedIn: true, checkedInAt: new Date(), checkpointId: checkpointId || null },
  });

  return { success: true, data: { name: registration.user.name, alreadyCheckedIn: false } };
}

/**
 * Contrôle d'accès multi-points (7 août 2026, demande client 3ème édition)
 * — CRUD minimal des postes de scan d'un évènement (ex. "Entrée VIP",
 * "Entrée Staff"). Suppression sans garde d'usage : un poste est une
 * métadonnée opérationnelle, pas une donnée facturable — un check-in déjà
 * effectué perd juste sa référence au poste (ON DELETE SET NULL), le
 * comptage global reste correct.
 */
export async function createEventCheckpoint(
  eventId: string,
  name: string
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin("evenements");

  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "Nom du poste requis." };
  if (trimmed.length > 60) return { success: false, error: "Nom du poste trop long (60 max)." };

  const checkpoint = await prisma.eventCheckpoint.create({ data: { eventId, name: trimmed } });
  revalidatePath(`/admin/evenements/${eventId}/checkin`);
  return { success: true, data: { id: checkpoint.id } };
}

export async function deleteEventCheckpoint(checkpointId: string): Promise<ActionResult> {
  await requireAdmin("evenements");

  const checkpoint = await prisma.eventCheckpoint.findUnique({ where: { id: checkpointId } });
  if (!checkpoint) return { success: false, error: "Poste introuvable." };

  await prisma.eventCheckpoint.delete({ where: { id: checkpointId } });
  revalidatePath(`/admin/evenements/${checkpoint.eventId}/checkin`);
  return { success: true, data: undefined };
}
