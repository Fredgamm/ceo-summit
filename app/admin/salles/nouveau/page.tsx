import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getReferentialLabels } from "@/lib/referentials-query";
import { RoomForm } from "@/components/admin/rooms/room-form";

export const metadata: Metadata = { title: "Admin — Nouvelle salle" };

export default async function NewRoomPage() {
  try {
    await requireAdmin("salles");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const sectors = await getReferentialLabels("sector");

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Créer une salle</h1>
      <RoomForm mode="create" sectors={sectors} />
    </div>
  );
}
