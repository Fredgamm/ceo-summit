import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EventSessionForm } from "@/components/admin/events/event-session-form";

export const metadata: Metadata = { title: "Admin — Nouvelle session" };

export default async function NewEventSessionPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { id: true, title: true },
  });
  if (!event) notFound();

  return (
    <div>
      <Link href={`/admin/evenements/${event.id}/agenda`} className="text-sm text-text-muted">
        ← Agenda — {event.title}
      </Link>
      <h1 className="mb-4 mt-2 text-xl font-bold text-navy">Nouvelle session</h1>
      <EventSessionForm mode="create" eventId={event.id} />
    </div>
  );
}
