"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { eventSessionFormSchema } from "@/lib/validations/event-session";
import { parseSpeakersText } from "@/lib/event-content";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E10 — agenda dynamique multi-salles (5 août 2026). CRUD des créneaux
 * d'un évènement, même parti pris que app/actions/admin-events.ts : pas de
 * vérification d'admin séparée, `requireAdmin("evenements")` couvre déjà
 * cette section (l'agenda est une sous-page d'un évènement, pas une
 * section RBAC à part).
 */
type SessionFields = Omit<Prisma.EventSessionUncheckedCreateInput, "eventId">;

function toSessionData(input: unknown): { error: string } | { data: SessionFields } {
  const parsed = eventSessionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  return {
    data: {
      title: f.title,
      description: f.description || null,
      room: f.room,
      startTime: new Date(f.startTime),
      endTime: new Date(f.endTime),
      speakers: parseSpeakersText(f.speakersText) as unknown as Prisma.InputJsonValue,
    },
  };
}

export async function createEventSession(
  eventId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin("evenements");

  const result = toSessionData(input);
  if ("error" in result) return { success: false, error: result.error };

  const session = await prisma.eventSession.create({
    data: { ...result.data, eventId },
  });

  revalidatePath(`/admin/evenements/${eventId}/agenda`);
  revalidatePath(`/evenements/${eventId}`);
  return { success: true, data: { id: session.id } };
}

export async function updateEventSession(sessionId: string, input: unknown): Promise<ActionResult> {
  await requireAdmin("evenements");

  const result = toSessionData(input);
  if ("error" in result) return { success: false, error: result.error };

  const updated = await prisma.eventSession.update({ where: { id: sessionId }, data: result.data });

  revalidatePath(`/admin/evenements/${updated.eventId}/agenda`);
  revalidatePath(`/evenements/${updated.eventId}`);
  return { success: true, data: undefined };
}

export async function deleteEventSession(sessionId: string): Promise<ActionResult> {
  await requireAdmin("evenements");

  const deleted = await prisma.eventSession.delete({ where: { id: sessionId } });

  revalidatePath(`/admin/evenements/${deleted.eventId}/agenda`);
  revalidatePath(`/evenements/${deleted.eventId}`);
  return { success: true, data: undefined };
}
