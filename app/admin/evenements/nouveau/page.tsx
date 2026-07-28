import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { EventForm } from "@/components/admin/event-form";

export const metadata: Metadata = { title: "Admin — Nouvel événement" };

export default async function NewEventPage() {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-navy">Créer un événement</h1>
      <EventForm mode="create" />
    </div>
  );
}
