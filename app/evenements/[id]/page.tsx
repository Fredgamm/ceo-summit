import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { RegistrationStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageCompany } from "@/lib/staff-organization";
import { eventCapacityBadge } from "@/lib/events-query";
import { cleanPlanName, getActivePlans } from "@/lib/plans-query";
import { activeEventOf } from "@/lib/event-participation";
import { seatCap } from "@/lib/company-seats";
import { speakersToText } from "@/lib/event-content";
import { attachmentKindLabel, formatFileSize } from "@/lib/event-attachments";
import { countUnreadMessages } from "@/lib/conversations";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelRegistrationButton } from "@/components/evenements/cancel-registration-button";
import { EventAccessTicket } from "@/components/evenements/event-access-ticket";
import { arToEur, formatDateFr, formatEuro, initials } from "@/lib/utils";
import { getEurToArRate } from "@/lib/currency-conversion";
import { AriaryHint } from "@/components/ui/ariary-hint";
import {
  formatDayKey,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";

export const metadata: Metadata = { title: "Détail événement" };

const TAKEN_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING_PAYMENT"];

/**
 * E3-T02 — détail événement. Le lien de webinaire Zoom n'est jamais affiché
 * publiquement ici (même logique que le wireframe : "Lien envoyé par
 * email") — seuls les inscrits confirmés le reçoivent par email.
 */
export default async function EventDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              title: true,
              company: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 12,
      },
      sessions: { orderBy: { startTime: "asc" } },
      // Module 21 D17-D18 — pièces jointes à la place des « Intervenants confirmés ».
      attachments: { orderBy: { position: "asc" } },
      _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
    },
  });
  if (!event || event.status !== "PUBLISHED") notFound();

  /**
   * Phase 2quater (1er août 2026) — si cet évènement a des offres
   * configurées, elles remplacent l'ancien bouton simple d'inscription
   * (virement/mobile money, sans preuve) pour éviter un double mécanisme.
   */
  const [eventOffers, viewerRegistration] = await Promise.all([
    getActivePlans({ selfServiceOnly: true, eventId: event.id }),
    // Lu à part : `event.registrations` n'est qu'un aperçu de 12 participants.
    prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
      select: { status: true },
    }),
  ]);
  const isCompanyAdmin = viewer.company ? await canManageCompany(viewer, viewer.company) : false;

  const isRegistered =
    viewerRegistration !== null && TAKEN_STATUSES.includes(viewerRegistration.status);
  const capacity = eventCapacityBadge(event.capacity, event._count.registrations);
  const spotsLeft = Math.max(0, event.capacity - event._count.registrations);
  const isPast = event.date < new Date();

  // Module 18 §4.9 — l'offre de l'entreprise donne-t-elle déjà accès à cet
  // événement ? Dans ce cas, pas de pass à acheter : le gérant désigne les
  // participants depuis l'espace de son entreprise.
  const companySubscription = viewer.company?.subscription ?? null;
  const accessViaOffer = activeEventOf(companySubscription)?.eventId === event.id;
  const companyParticipants =
    accessViaOffer && isCompanyAdmin && viewer.companyId
      ? await prisma.eventRegistration.count({
          where: { eventId: event.id, status: "CONFIRMED", user: { companyId: viewer.companyId } },
        })
      : 0;
  const companySeats = accessViaOffer && companySubscription ? seatCap(companySubscription) : null;

  const showPasses = eventOffers.length > 0 && !accessViaOffer && !isRegistered && !isPast;
  // Module 21 D19 — dates et heures dans le fuseau de l'événement, pas celui du serveur.
  const tz = event.timezone;
  const eventPeriod = event.endDate
    ? zonedDayKey(event.date, tz) === zonedDayKey(event.endDate, tz)
      ? `${formatDateFr(event.date, tz)} · ${formatTimeRangeInZone(event.date, event.endDate, tz)}`
      : `Du ${formatDateFr(event.date, tz)} au ${formatDateFr(event.endDate, tz)}`
    : formatDateFr(event.date, tz);
  const unreadMessages = await countUnreadMessages(viewer.id);

  // E10 — agenda dynamique multi-salles (5 août 2026) : sessions groupées
  // par jour calendaire, dans l'ordre de leur horaire — des sessions au
  // même créneau dans des salles différentes s'affichent l'une sous
  // l'autre (voir la note de app/admin/evenements/[id]/agenda/page.tsx sur
  // la grille multi-colonnes, pas construite ici pour rester simple).
  const sessionsByDay = new Map<string, typeof event.sessions>();
  for (const eventSession of event.sessions) {
    // Module 21 D19 — jour et heures dans le fuseau de l'événement.
    const dayKey = zonedDayKey(eventSession.startTime, event.timezone);
    const existing = sessionsByDay.get(dayKey) ?? [];
    existing.push(eventSession);
    sessionsByDay.set(dayKey, existing);
  }
  const tzLabel = timezoneLabel(event.timezone);

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
          <span>📅 {eventPeriod}</span>
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
              <h2 className="text-base font-bold text-navy">Programme</h2>
              <p className="mb-3 text-xs text-text-muted">Horaires en {tzLabel}</p>
              <div className="flex flex-col gap-5">
                {[...sessionsByDay.entries()].map(([dayKey, daySessions]) => (
                  <div key={dayKey} className="border-l-2 border-gold pl-4">
                    <p className="mb-2 text-xs font-bold uppercase text-gold">
                      {formatDayKey(dayKey)}
                    </p>
                    <div className="flex flex-col gap-3">
                      {daySessions.map((eventSession) => (
                        <div
                          key={eventSession.id}
                          className="text-sm leading-relaxed text-text-mid"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-navy">
                              {formatTimeRangeInZone(
                                eventSession.startTime,
                                eventSession.endTime,
                                event.timezone
                              )}
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

          {event.attachments.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">Documents</h2>
              <ul className="flex flex-col divide-y divide-border">
                {event.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={attachment.fileName}
                      className="flex items-center gap-3 py-2 text-sm hover:text-navy-mid"
                    >
                      <span className="rounded bg-surface-2 px-2 py-1 text-xs font-bold text-navy">
                        {attachmentKindLabel(attachment.mimeType)}
                      </span>
                      <span className="flex-1 font-semibold text-navy">{attachment.title}</span>
                      <span className="text-xs text-text-muted">
                        {formatFileSize(attachment.sizeBytes)} ↓
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {event.registrations.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">
                Participants inscrits ({event._count.registrations}/{event.capacity})
              </h2>
              {/* 14 oct. 2026 — cartes cliquables vers le profil du membre
                  (nom, fonction, entreprise) au lieu de simples initiales. */}
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {event.registrations.map((r) => {
                  const details = [r.user.title, r.user.company?.name].filter(Boolean).join(" · ");
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/membres/${r.user.id}`}
                        className="group flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2.5 transition-colors hover:border-navy-light hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={r.user.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback className="text-xs">
                            {initials(r.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-navy">
                              {r.user.name}
                            </span>
                            {r.user.id === viewer.id && (
                              <span className="shrink-0 rounded-full bg-navy-light px-2 py-0.5 text-[10px] font-semibold text-navy">
                                Vous
                              </span>
                            )}
                          </span>
                          {details && (
                            <span className="block truncate text-xs text-text-muted">
                              {details}
                            </span>
                          )}
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {event._count.registrations > event.registrations.length && (
                <p className="mt-3 text-xs text-text-muted">
                  et {event._count.registrations - event.registrations.length} autre(s)
                  participant(s)
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {accessViaOffer && !isPast ? (
            <EventAccessTicket
              eyebrow="Inclus dans votre offre"
              title={cleanPlanName(companySubscription!.plan.name)}
              actions={
                <>
                  {isCompanyAdmin && (
                    <Button asChild variant="gold" className="w-full justify-center">
                      <Link href={`/entreprises/${viewer.companyId}?tab=gestion`}>
                        {companyParticipants > 0
                          ? "Gérer les participants"
                          : "Désigner les participants"}
                      </Link>
                    </Button>
                  )}
                  {isRegistered && (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full justify-center border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    >
                      <Link href={`/evenements/${event.id}/badge`}>Voir mon badge</Link>
                    </Button>
                  )}
                </>
              }
            >
              {isCompanyAdmin ? (
                <p>
                  {companySeats != null
                    ? `${companyParticipants} / ${companySeats} participants désignés.`
                    : `${companyParticipants} participant${companyParticipants > 1 ? "s" : ""} désigné${companyParticipants > 1 ? "s" : ""}.`}{" "}
                  Choisissez qui, dans votre entreprise, assiste à l&apos;événement.
                </p>
              ) : isRegistered ? (
                <p>
                  Vous êtes inscrit(e) par votre entreprise. Pour toute modification, adressez-vous
                  à son gérant.
                </p>
              ) : (
                <p>Le gérant de votre entreprise désigne les participants à cet événement.</p>
              )}
            </EventAccessTicket>
          ) : showPasses ? (
            <EventAccessTicket
              eyebrow="Inclus dans votre inscription"
              title="Votre accès est déjà réservé"
              actions={
                <Button asChild variant="gold" className="w-full justify-center">
                  <a href="mailto:register@ceo-summit.mg">Contacter l&apos;équipe</a>
                </Button>
              }
            >
              <p>
                Cet événement est compris dans votre participation au CEO Summit, sans démarche ni
                frais supplémentaires.
              </p>
              <p className="mt-2">
                Une question ? Notre équipe reste disponible :{" "}
                <a href="mailto:register@ceo-summit.mg" className="underline underline-offset-2">
                  register@ceo-summit.mg
                </a>
              </p>
            </EventAccessTicket>
          ) : (
            <div className="rounded-lg border-2 border-gold-light bg-gold-pale p-5 text-center">
              <p className="text-xl font-bold text-navy">
                {event.price === 0
                  ? "Gratuit"
                  : formatEuro(arToEur(event.price, await getEurToArRate()))}
              </p>
              {event.price > 0 && <AriaryHint amountAr={event.price} exact />}
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
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-text-muted">Date</dt>
                <dd className="text-right font-semibold text-navy">
                  {eventPeriod}
                  <span className="block text-xs font-normal text-text-muted">{tzLabel}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-text-muted">Lieu</dt>
                <dd className="text-right font-semibold text-navy">
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
