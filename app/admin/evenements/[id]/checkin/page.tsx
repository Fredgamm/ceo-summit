import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { CheckinScanner } from "@/components/admin/checkin-scanner";
import { CheckpointManager } from "@/components/admin/checkpoint-manager";

export const metadata: Metadata = { title: "Admin — Check-in" };

export default async function EventCheckinPage({ params }: { params: { id: string } }) {
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

  const checkpoints = await prisma.eventCheckpoint.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { registrations: { where: { checkedIn: true } } } } },
  });
  const checkpointsWithCount = checkpoints.map((cp) => ({
    id: cp.id,
    name: cp.name,
    checkedInCount: cp._count.registrations,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <Link href={`/admin/evenements/${event.id}/inscrits`} className="text-sm text-text-muted">
          ← Inscrits
        </Link>
        <h1 className="mt-2 text-xl font-bold text-navy">Check-in — {event.title}</h1>
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        <CheckpointManager eventId={event.id} checkpoints={checkpointsWithCount} />
      </div>

      <CheckinScanner
        eventId={event.id}
        checkpoints={checkpoints.map((cp) => ({ id: cp.id, name: cp.name }))}
      />
    </div>
  );
}
