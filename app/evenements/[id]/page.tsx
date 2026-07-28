import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { RegistrationStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { eventCapacityBadge } from "@/lib/events-query";
import { parseProgram, parseSpeakers } from "@/lib/event-content";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAriary, formatDateFr, initials, meetsMinTier, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Détail événement" };

const TAKEN_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING_PAYMENT"];

/**
 * E3-T02 — détail événement. Le lien de webinaire Zoom n'est jamais affiché
 * publiquement ici (même logique que le wireframe : "Lien envoyé par
 * email") — seuls les inscrits confirmés le reçoivent par email.
 */
export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!viewer) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      registrations: {
        where: { status: { in: TAKEN_STATUSES } },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        take: 12,
      },
      _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
    },
  });
  if (!event || event.status !== "PUBLISHED") notFound();

  const viewerTier = viewer.memberships[0]?.tier;
  const tierOk = meetsMinTier(viewerTier, event.minTier);
  const isRegistered = event.registrations.some((r) => r.user.id === viewer.id);
  const capacity = eventCapacityBadge(event.capacity, event._count.registrations);
  const spotsLeft = Math.max(0, event.capacity - event._count.registrations);
  const isPast = event.date < new Date();

  const program = parseProgram(event.program);
  const speakers = parseSpeakers(event.speakers);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewerTier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
      }}
    >
      <Link href="/evenements" className="mb-4 inline-block text-sm text-text-muted">
        ← Événements
      </Link>

      <div className="mb-6 rounded-lg bg-navy p-8 text-white">
        <Badge variant="secondary" className="mb-3">
          {event.type === "SUMMIT" ? "⭐ Summit annuel" : event.type}
        </Badge>
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/70">
          <span>📅 {formatDateFr(event.date)}</span>
          <span>{event.isOnline ? "🌐 En ligne" : `📍 ${event.location}`}</span>
          <span>
            👥 {event._count.registrations}/{event.capacity} inscrits
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-navy">À propos de l&apos;événement</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-mid">
              {event.description}
            </p>
          </div>

          {program.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">Programme</h2>
              <div className="flex flex-col gap-4 border-l-2 border-gold pl-4">
                {program.map((block) => (
                  <div key={block.day}>
                    <p className="mb-1 text-xs font-bold uppercase text-gold">{block.day}</p>
                    <div className="text-sm leading-relaxed text-text-mid">
                      {block.items.map((item, i) => (
                        <p key={i}>{item}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {speakers.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">Intervenants confirmés</h2>
              <div className="flex flex-col gap-3">
                {speakers.map((speaker) => (
                  <div key={speaker.name} className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{initials(speaker.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-navy">{speaker.name}</p>
                      <p className="text-xs text-text-muted">
                        {[speaker.title, speaker.company].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {event.registrations.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">
                Participants inscrits ({event._count.registrations}/{event.capacity})
              </h2>
              <div className="flex flex-wrap gap-2">
                {event.registrations.map((r) => (
                  <Avatar key={r.id} className="h-9 w-9" title={r.user.name}>
                    <AvatarImage src={r.user.avatarUrl ?? undefined} alt={r.user.name} />
                    <AvatarFallback>{initials(r.user.name)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border-2 border-gold-light bg-gold-pale p-5 text-center">
            <p className="text-xl font-bold text-navy">
              {event.price === 0 ? "Gratuit" : formatAriary(event.price)}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {event.price === 0 ? "Inclus membership" : "par participant"}
            </p>

            {isRegistered ? (
              <>
                <Badge variant="approved" className="mt-4 w-full justify-center py-2">
                  Inscrit ✓
                </Badge>
                <Button asChild variant="outline" className="mt-2 w-full justify-center">
                  <Link href={`/evenements/${event.id}/badge`}>Voir mon badge</Link>
                </Button>
              </>
            ) : isPast ? (
              <Button disabled className="mt-4 w-full justify-center">
                Événement passé
              </Button>
            ) : !tierOk ? (
              <Button disabled className="mt-4 w-full justify-center">
                Accès {tierLabel(event.minTier)} requis
              </Button>
            ) : capacity === "complet" ? (
              <Button disabled className="mt-4 w-full justify-center">
                Complet
              </Button>
            ) : (
              <Button asChild size="lg" className="mt-4 w-full justify-center">
                <Link href={`/evenements/${event.id}/inscrire`}>S&apos;inscrire maintenant</Link>
              </Button>
            )}

            {!isRegistered && tierOk && !isPast && capacity !== "complet" && (
              <p className="mt-2 text-xs text-text-muted">
                {capacity === "limite"
                  ? `⚡ Plus que ${spotsLeft} places`
                  : `${spotsLeft} places disponibles`}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-xs font-bold uppercase text-text-muted">Détails pratiques</p>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Date</dt>
                <dd className="font-semibold text-navy">{formatDateFr(event.date)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Lieu</dt>
                <dd className="font-semibold text-navy">
                  {event.isOnline ? "En ligne" : event.location}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Accès</dt>
                <dd className="font-semibold text-navy">{tierLabel(event.minTier)}+</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Capacité</dt>
                <dd className="font-semibold text-navy">{event.capacity} places</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
