import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { speakersToText } from "@/lib/event-content";
import { EventSessionForm } from "@/components/admin/events/event-session-form";

export const metadata: Metadata = { title: "Admin — Éditer une session" };

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
    prisma.event.findUnique({ where: { id: params.id }, select: { id: true, title: true } }),
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
        initialValues={{
          title: session.title,
          description: session.description ?? "",
          room: session.room,
          startTime: toDatetimeLocalValue(session.startTime),
          endTime: toDatetimeLocalValue(session.endTime),
          speakersText: speakersToText(session.speakers),
        }}
      />
    </div>
  );
}
