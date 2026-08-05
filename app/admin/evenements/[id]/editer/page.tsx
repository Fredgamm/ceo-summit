import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { speakersToText } from "@/lib/event-content";
import { EventForm } from "@/components/admin/event-form";
import { EventStatusActions } from "@/components/admin/event-status-actions";

export const metadata: Metadata = { title: "Admin — Éditer l'événement" };

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const [event, offersCount] = await Promise.all([
    prisma.event.findUnique({ where: { id: params.id } }),
    prisma.plan.count({ where: { eventId: params.id } }),
  ]);
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/evenements" className="text-sm text-text-muted">
            ← Événements
          </Link>
          <h1 className="text-xl font-bold text-navy">{event.title}</h1>
        </div>
        <div className="flex gap-4">
          <Link
            href={`/admin/evenements/${event.id}/agenda`}
            className="text-sm font-semibold text-navy-mid"
          >
            Agenda multi-salles →
          </Link>
          <Link
            href={`/admin/plans?eventId=${event.id}`}
            className="text-sm font-semibold text-navy-mid"
          >
            Offres de cet évènement ({offersCount}) →
          </Link>
          <Link
            href={`/admin/evenements/${event.id}/inscrits`}
            className="text-sm font-semibold text-navy-mid"
          >
            Voir les inscrits →
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <p className="mb-2 text-xs font-bold uppercase text-text-muted">Statut de publication</p>
        <div className="flex gap-2">
          <EventStatusActions eventId={event.id} status={event.status} />
        </div>
      </div>

      <EventForm
        mode="edit"
        eventId={event.id}
        initialValues={{
          title: event.title,
          type: event.type,
          description: event.description,
          speakersText: speakersToText(event.speakers),
          location: event.location,
          isOnline: event.isOnline,
          zoomMeetingId: event.zoomMeetingId ?? "",
          date: toDatetimeLocalValue(event.date),
          capacity: String(event.capacity),
          minTier: event.minTier,
          price: String(event.price),
          imageUrl: event.imageUrl ?? "",
        }}
      />
    </div>
  );
}
