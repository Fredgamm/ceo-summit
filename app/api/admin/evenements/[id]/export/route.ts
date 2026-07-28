import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { formatDateFr } from "@/lib/utils";

/** E3-T04 — "Export liste inscrits CSV". */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin("evenements");
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) {
    return NextResponse.json({ error: "Événement introuvable." }, { status: 404 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: params.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true, role: true } } },
  });

  const rows = [
    ["Nom", "Email", "Tier", "Statut", "Paiement", "Mode de paiement", "Inscrit le", "Check-in"],
    ...registrations.map((r) => [
      r.user.name,
      r.user.email,
      r.user.role,
      r.status,
      r.paymentStatus,
      r.paymentMethod ?? "",
      formatDateFr(r.createdAt),
      r.checkedIn ? "Oui" : "Non",
    ]),
  ];

  const csv = toCsv(rows);
  const filename = `inscrits-${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
