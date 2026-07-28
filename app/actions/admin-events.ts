"use server";

import { revalidatePath } from "next/cache";
import type { EventStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { eventFormSchema } from "@/lib/validations/event";
import { parseProgramText, parseSpeakersText } from "@/lib/event-content";

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
      program: parseProgramText(f.programText) as unknown as Prisma.InputJsonValue,
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
 * E3-T04 — check-in. `code` is typed or pasted in, not scanned by camera —
 * see /admin/evenements/[id]/checkin for that scope note. Only a CONFIRMED
 * registration (paid or included) can be checked in, matching the
 * wireframe's disabled "—" for pending-payment rows.
 */
export async function checkInRegistration(
  eventId: string,
  code: string
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

  await prisma.eventRegistration.update({
    where: { id: registration.id },
    data: { checkedIn: true, checkedInAt: new Date() },
  });

  return { success: true, data: { name: registration.user.name, alreadyCheckedIn: false } };
}
