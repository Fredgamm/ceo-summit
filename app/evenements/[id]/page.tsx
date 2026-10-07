import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { RegistrationStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { eventCapacityBadge } from "@/lib/events-query";
import { getActivePlans } from "@/lib/plans-query";
import { getEurToArRate } from "@/lib/currency-conversion";
import { parseSpeakers, speakersToText } from "@/lib/event-content";
import { countUnreadMessages } from "@/lib/conversations";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanPicker } from "@/components/entreprise/plan-picker";
import { CancelRegistrationButton } from "@/components/evenements/cancel-registration-button";
import { formatAriary, formatDateFr, initials } from "@/lib/utils";

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
    include: VIEWER_TIER_INCLUDE,
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
      sessions: { orderBy: { startTime: "asc" } },
      _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
    },
  });
  if (!event || event.status !== "PUBLISHED") notFound();

  /**
   * Phase 2quater (1er août 2026) — si cet évènement a des offres
   * configurées, elles remplacent l'ancien bouton simple d'inscription
   * (virement/mobile money, sans preuve) pour éviter un double mécanisme.
   */
  const [eventOffers, liveEurToArRate, viewerRegistration] = await Promise.all([
    getActivePlans({ selfServiceOnly: true, eventId: event.id }),
    getEurToArRate(),
    // Lu à part : `event.registrations` n'est qu'un aperçu de 12 participants.
    prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
      select: { status: true },
    }),
  ]);
  const isCompanyAdmin = viewer.company?.companyAdminId === viewer.id;

  const isRegistered =
    viewerRegistration !== null && TAKEN_STATUSES.includes(viewerRegistration.status);
  const capacity = eventCapacityBadge(event.capacity, event._count.registrations);
  const spotsLeft = Math.max(0, event.capacity - event._count.registrations);
  const isPast = event.date < new Date();

  const speakers = parseSpeakers(event.speakers);
  const unreadMessages = await countUnreadMessages(viewer.id);

  // E10 — agenda dynamique multi-salles (5 août 2026) : sessions groupées
  // par jour calendaire, dans l'ordre de leur horaire — des sessions au
  // même créneau dans des salles différentes s'affichent l'une sous
  // l'autre (voir la note de app/admin/evenements/[id]/agenda/page.tsx sur
  // la grille multi-colonnes, pas construite ici pour rester simple).
  const sessionsByDay = new Map<string, typeof event.sessions>();
  for (const eventSession of event.sessions) {
    const dayKey = eventSession.startTime.toISOString().slice(0, 10);
    const existing = sessionsByDay.get(dayKey) ?? [];
    existing.push(eventSession);
    sessionsByDay.set(dayKey, existing);
  }
  const formatTimeRange = (start: Date, end: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const t = (d: Date) => `${pad(d.getHours())}h${pad(d.getMinutes())}`;
    return `${t(start)} – ${t(end)}`;
  };

  return (
    <AppShell
      user={{
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
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

          {event.sessions.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">Programme</h2>
              <div className="flex flex-col gap-5">
                {[...sessionsByDay.entries()].map(([dayKey, daySessions]) => (
                  <div key={dayKey} className="border-l-2 border-gold pl-4">
                    <p className="mb-2 text-xs font-bold uppercase text-gold">
                      {formatDateFr(new Date(dayKey))}
                    </p>
                    <div className="flex flex-col gap-3">
                      {daySessions.map((eventSession) => (
                        <div
                          key={eventSession.id}
                          className="text-sm leading-relaxed text-text-mid"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-navy">
                              {formatTimeRange(eventSession.startTime, eventSession.endTime)}
                            </span>
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-navy">
                              {eventSession.room}
                            </span>
                          </div>
                          <p className="font-semibold text-navy">{eventSession.title}</p>
                          {eventSession.description && <p>{eventSession.description}</p>}
                          {speakersToText(eventSession.speakers) && (
                            <p className="text-xs text-text-muted">
                              {speakersToText(eventSession.speakers).split("\n").join(" · ")}
                            </p>
                          )}
                        </div>
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
          {eventOffers.length > 0 && !isRegistered && !isPast ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border-2 border-gold-light bg-gold-pale p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                  Pass entreprise
                </p>
                {viewer.company ? (
                  isCompanyAdmin ? (
                    <PlanPicker
                      companyId={viewer.company.id}
                      plans={eventOffers}
                      liveEurToArRate={liveEurToArRate}
                    />
                  ) : (
                    <p className="text-sm text-text-muted">
                      Seul l&apos;admin de votre entreprise peut choisir un pass entreprise.
                    </p>
                  )
                ) : (
                  <div className="flex flex-col gap-2">
                    {eventOffers.map((plan) => (
                      <Button key={plan.id} asChild variant="outline" className="justify-center">
                        <Link href={`/entreprise/creer?offre=${plan.slug}`}>
                          {plan.name} —{" "}
                          {plan.pricingMode === "PER_PARTICIPANT"
                            ? `${formatAriary(plan.priceAr)}/participant`
                            : formatAriary(plan.priceAr)}
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
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
                  {!isPast && <CancelRegistrationButton eventId={event.id} />}
                </>
              ) : isPast ? (
                <Button disabled className="mt-4 w-full justify-center">
                  Événement passé
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

              {!isRegistered && !isPast && capacity !== "complet" && (
                <p className="mt-2 text-xs text-text-muted">
                  {capacity === "limite"
                    ? `⚡ Plus que ${spotsLeft} places`
                    : `${spotsLeft} places disponibles`}
                </p>
              )}
            </div>
          )}

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
