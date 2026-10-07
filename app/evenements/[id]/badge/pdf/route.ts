import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { renderEventBadgePdf } from "@/lib/pdf/event-badge-pdf";
import { formatDateFr } from "@/lib/utils";

/**
 * GET /evenements/[id]/badge/pdf — badge téléchargeable au format A6
 * (7 août 2026, demande client). Mêmes vérifications que la page badge en
 * ligne (`/evenements/[id]/badge`) — même garde "inscription confirmée
 * uniquement", dupliquée ici plutôt que factorisée : la page retourne du
 * JSX, cette route un buffer PDF, peu de logique commune au-delà des
 * requêtes Prisma elles-mêmes.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const [event, viewer] = await Promise.all([
    prisma.event.findUnique({ where: { id: params.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: VIEWER_TIER_INCLUDE,
    }),
  ]);
  if (!event || !viewer) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
    include: { plan: { select: { name: true } } },
  });
  if (!registration || registration.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Badge non disponible." }, { status: 403 });
  }

  const accessLabel =
    registration.plan?.name ?? viewer.company?.subscription?.plan.name ?? "Membre";

  const pdf = await renderEventBadgePdf({
    eventTitle: event.title,
    eventDateLabel: formatDateFr(event.date),
    eventLocation: event.isOnline ? "En ligne" : event.location,
    participantName: viewer.name,
    participantTitle: viewer.title,
    companyName: viewer.company?.name ?? null,
    avatarUrl: viewer.avatarUrl,
    accessLabel,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="badge-${event.id}.pdf"`,
    },
  });
}
