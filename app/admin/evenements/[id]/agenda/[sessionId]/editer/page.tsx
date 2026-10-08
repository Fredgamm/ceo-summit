import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { speakersToText } from "@/lib/event-content";
import { timezoneLabel, utcToZonedLocal } from "@/lib/event-timezone";
import { EventSessionForm } from "@/components/admin/events/event-session-form";

export const metadata: Metadata = { title: "Admin — Éditer une session" };

export default async function EditEventSessionPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const [event, session] = await Promise.all([
    prisma.event.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, timezone: true },
    }),
    prisma.eventSession.findUnique({ where: { id: params.sessionId } }),
  ]);
  if (!event || !session || session.eventId !== event.id) notFound();

  return (
    <div>
      <Link href={`/admin/evenements/${event.id}/agenda`} className="text-sm text-text-muted">
        ← Agenda — {event.title}
      </Link>
      <h1 className="mb-4 mt-2 text-xl font-bold text-navy">Éditer {session.title}</h1>
      <EventSessionForm
        mode="edit"
        eventId={event.id}
        sessionId={session.id}
        timezoneLabel={timezoneLabel(event.timezone)}
        initialValues={{
          title: session.title,
          description: session.description ?? "",
          room: session.room,
          startTime: utcToZonedLocal(session.startTime, event.timezone),
          endTime: utcToZonedLocal(session.endTime, event.timezone),
          speakersText: speakersToText(session.speakers),
        }}
      />
    </div>
  );
}
