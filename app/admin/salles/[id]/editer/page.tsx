import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getReferentialLabels } from "@/lib/referentials-query";
import { RoomForm } from "@/components/admin/rooms/room-form";

export const metadata: Metadata = { title: "Admin — Éditer une salle" };

export default async function EditRoomPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("salles");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const [room, sectors] = await Promise.all([
    prisma.room.findUnique({ where: { id: params.id } }),
    getReferentialLabels("sector"),
  ]);
  if (!room) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Éditer {room.name}</h1>
      <RoomForm
        mode="edit"
        roomId={room.id}
        sectors={sectors}
        initialValues={{
          name: room.name,
          description: room.description ?? "",
          sector: room.sector,
          minTier: room.minTier,
        }}
      />
    </div>
  );
}
