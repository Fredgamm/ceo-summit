import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { Badge } from "@/components/ui/badge";
import { formatDateFr, initials, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon badge" };

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

/**
 * E3-T04 — badge numérique. "Si l'inscription n'est pas confirmée (paiement
 * en attente), badge non disponible" — redirige plutôt que d'afficher un
 * badge à moitié valide. Fonctionne hors-ligne une fois chargée : le QR
 * code est une image data: URI intégrée à la page, aucun appel réseau au
 * moment de le montrer à l'accueil.
 */
export default async function EventBadgePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [event, viewer] = await Promise.all([
    prisma.event.findUnique({ where: { id: params.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: VIEWER_TIER_INCLUDE,
    }),
  ]);
  if (!event || !viewer) notFound();

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
  });

  if (!registration || registration.status !== "CONFIRMED") {
    redirect(`/evenements/${event.id}`);
  }

  const qrCodeDataUrl = await QRCode.toDataURL(registration.badgeQrCode, { width: 220, margin: 1 });
  const tier = getViewerTierFromCompany(viewer.company);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-dark p-6 text-white shadow-card-lg">
        <p className="text-xs uppercase tracking-wide text-white/50">Badge digital CEO Summit</p>
        <h1 className="mt-1 text-lg font-extrabold">{event.title}</h1>
        <p className="mt-1 text-sm text-white/60">
          {formatDateFr(event.date)} · {event.isOnline ? "En ligne" : event.location}
        </p>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
            {initials(viewer.name)}
          </div>
          <div>
            <p className="font-bold">{viewer.name}</p>
            <p className="text-xs text-white/60">{viewer.title ?? "Membre CEO Summit"}</p>
          </div>
          {tier && <Badge variant={TIER_BADGE[tier]}>{tierLabel(tier)}</Badge>}
        </div>

        <div className="mt-6 rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCodeDataUrl}
            alt="QR code du badge"
            className="mx-auto h-auto w-full max-w-[220px]"
          />
        </div>

        <p className="mt-4 text-center text-xs text-white/40">
          Présentez ce QR code à l&apos;accueil de l&apos;événement.
        </p>
      </div>
    </div>
  );
}
