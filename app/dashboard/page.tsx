import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import type { RegistrationStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { allowedVisibilities } from "@/lib/deal-room-query";
import { eventCapacityBadge } from "@/lib/events-query";
import { profileCompleteness } from "@/lib/profile-completeness";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { MemberCard } from "@/components/catalogue/member-card";
import { OpportunityCard } from "@/components/deal-room/opportunity-card";
import { EventCard } from "@/components/events/event-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDateFr, initials } from "@/lib/utils";
import { offerBadgeLabel } from "@/lib/offer-badge";
import { AddButton } from "@/components/ui/add-button";

export const metadata: Metadata = { title: "Accueil" };

const TAKEN_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING_PAYMENT"];

interface ActivityItem {
  date: Date;
  icon: string;
  label: string;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!user) redirect("/login");

  const viewerTier = getViewerTierFromCompany(user.company);
  const companySubscription = user.company?.subscription;
  const isCompanyAdmin = user.company?.companyAdminId === user.id;

  const [
    upcomingEvents,
    opportunities,
    newMembers,
    dealRoomConnections,
    registeredEventsCount,
    pendingContactsReceived,
    acceptedContactsInitiated,
    unreadMessagesList,
    unreadMessages,
    teammates,
    teamSize,
  ] = await Promise.all([
    prisma.event.findMany({
      where: { status: "PUBLISHED", date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 2,
      include: {
        registrations: { where: { userId: user.id }, select: { id: true } },
        _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
      },
    }),
    prisma.opportunity.findMany({
      where: {
        status: "PUBLISHED",
        visibility: { in: allowedVisibilities(viewerTier) },
        authorId: { not: user.id },
      },
      orderBy: { createdAt: "desc" },
      take: 2,
      include: {
        author: {
          select: {
            name: true,
            title: true,
            avatarUrl: true,
            role: true,
            ...VIEWER_TIER_INCLUDE,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", id: { not: user.id } },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { company: { select: { name: true } } },
    }),
    prisma.opportunityContact.count({
      where: { status: "ACCEPTED", OR: [{ initiatorId: user.id }, { receiverId: user.id }] },
    }),
    prisma.eventRegistration.count({ where: { userId: user.id, status: "CONFIRMED" } }),
    prisma.opportunityContact.findMany({
      where: { receiverId: user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { initiator: { select: { name: true } }, opportunity: { select: { title: true } } },
    }),
    prisma.opportunityContact.findMany({
      where: { initiatorId: user.id, status: "ACCEPTED" },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { receiver: { select: { name: true } } },
    }),
    prisma.message.findMany({
      where: {
        readAt: null,
        senderId: { not: user.id },
        conversation: { OR: [{ member1Id: user.id }, { member2Id: user.id }] },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      distinct: ["conversationId"],
      include: { sender: { select: { name: true } } },
    }),
    countUnreadMessages(user.id),
    user.companyId
      ? prisma.user.findMany({
          where: { companyId: user.companyId, status: "ACTIVE", id: { not: user.id } },
          select: { id: true, name: true, title: true, avatarUrl: true },
          orderBy: { createdAt: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
    user.companyId
      ? prisma.user.count({ where: { companyId: user.companyId, status: "ACTIVE" } })
      : Promise.resolve(0),
  ]);

  const nextEvent = upcomingEvents[0] ?? null;

  const completeness = profileCompleteness(user);

  const activity: ActivityItem[] = [
    ...unreadMessagesList.map((m) => ({
      date: m.createdAt,
      icon: "✉",
      label: `Nouveau message de ${m.sender.name}`,
    })),
    ...pendingContactsReceived.map((c) => ({
      date: c.createdAt,
      icon: "🔔",
      label: `${c.initiator.name} s'intéresse à « ${c.opportunity.title} »`,
    })),
    ...acceptedContactsInitiated.map((c) => ({
      date: c.createdAt,
      icon: "◆",
      label: `${c.receiver.name} a accepté votre demande de contact`,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 4);

  return (
    <AppShell
      user={{
        name: user.name,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
      rightPanel={
        <div className="flex flex-col">
          <Link
            href={`/membres/${user.id}`}
            className="flex flex-col items-center gap-1 pb-5 text-center"
          >
            <Avatar className="mb-1 h-16 w-16">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <p className="text-sm font-bold text-navy">{user.name}</p>
            <p className="text-xs text-text-muted">
              {[user.title, user.company?.name].filter(Boolean).join(" · ")}
            </p>
            {offerBadgeLabel(user.company?.subscription) && (
              <Badge variant="chairman">{offerBadgeLabel(user.company?.subscription)}</Badge>
            )}
          </Link>

          <div className="border-t border-border py-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Profil complété
            </p>
            <div className="mb-2 flex items-center gap-2">
              <Progress value={completeness} className="flex-1" />
              <span className="text-sm font-bold text-gold">{completeness}%</span>
            </div>
            {completeness < 100 && (
              <Link href="/profil/editer" className="text-xs text-navy-mid">
                Compléter mon profil →
              </Link>
            )}
          </div>

          {companySubscription && (
            <div className="border-t border-border py-5">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Abonnement entreprise
              </p>
              <div className="rounded-lg border border-gold-light bg-gold-pale px-3.5 py-3">
                <div className="text-sm font-bold text-navy">{companySubscription.plan.name}</div>
                {companySubscription.endDate && (
                  <div className="mt-1 text-xs text-text-muted">
                    Valide jusqu&apos;au {formatDateFr(companySubscription.endDate)}
                  </div>
                )}
              </div>
            </div>
          )}

          {user.companyId && (
            <div className="border-t border-border py-5">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Mon équipe
                </p>
                <span className="text-sm font-bold text-navy">{teamSize}</span>
              </div>
              {teammates.length === 0 ? (
                <p className="mb-2 text-xs text-text-muted">
                  Vous êtes seul pour l&apos;instant sur ce compte entreprise.
                </p>
              ) : (
                <div className="mb-2 flex flex-col gap-2">
                  {teammates.map((teammate) => (
                    <Link
                      key={teammate.id}
                      href={`/membres/${teammate.id}`}
                      className="flex items-center gap-2"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={teammate.avatarUrl ?? undefined} alt={teammate.name} />
                        <AvatarFallback className="text-[10px]">
                          {initials(teammate.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-navy">{teammate.name}</p>
                        {teammate.title && (
                          <p className="truncate text-[11px] text-text-muted">{teammate.title}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {isCompanyAdmin ? (
                <Button asChild size="sm" className="w-full justify-center">
                  <Link href={`/entreprises/${user.companyId}?tab=gestion`}>
                    Inviter des collaborateurs →
                  </Link>
                </Button>
              ) : (
                <Link
                  href={`/entreprises/${user.companyId}?tab=membres`}
                  className="text-xs text-navy-mid"
                >
                  Voir mon entreprise →
                </Link>
              )}
            </div>
          )}

          <div className="py-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Activité récente
            </p>
            {activity.length === 0 ? (
              <p className="text-xs text-text-muted">Aucune activité récente.</p>
            ) : (
              <div className="flex flex-col gap-2.5 text-xs text-text-mid">
                {activity.map((item, i) => (
                  <div key={i}>
                    {item.icon} {item.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <AddButton href="/deal-room/publier" className="mt-1 w-full">
            Publier une opportunité
          </AddButton>
        </div>
      }
    >
      <div className="mb-6">
        <h1 className="text-xl font-bold text-navy">Bonjour, {user.name.split(" ")[0]} 👋</h1>
      </div>

      {nextEvent && (
        <div className="mb-6 flex flex-col items-start gap-4 rounded-lg bg-navy p-6 text-white sm:flex-row sm:items-center">
          <div>
            <span className="mb-1.5 inline-block rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-navy">
              PROCHAIN ÉVÉNEMENT
            </span>
            <p className="text-lg font-bold">{nextEvent.title}</p>
            <p className="text-sm text-white/60">
              📍 {nextEvent.isOnline ? "En ligne" : nextEvent.location} ·{" "}
              {formatDateFr(nextEvent.date, nextEvent.timezone)}
            </p>
          </div>
          <div className="sm:ml-auto sm:shrink-0">
            <Button asChild variant="gold">
              <Link href={`/evenements/${nextEvent.id}`}>
                {nextEvent.registrations.length > 0 ? "Voir mon inscription" : "S'inscrire"}
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-white px-5 py-4">
          <div className="text-2xl font-bold text-navy">{dealRoomConnections}</div>
          <div className="mt-0.5 text-xs text-text-muted">Connexions Deal Room</div>
        </div>
        <div className="rounded-lg border border-border bg-white px-5 py-4">
          <div className="text-2xl font-bold text-navy">{registeredEventsCount}</div>
          <div className="mt-0.5 text-xs text-text-muted">Événements inscrits</div>
        </div>
        <div className="rounded-lg border border-border bg-white px-5 py-4">
          <div className="text-2xl font-bold text-navy">{unreadMessages}</div>
          <div className="mt-0.5 text-xs text-text-muted">Messages non lus</div>
        </div>
      </div>

      {opportunities.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
              Nouvelles opportunités Deal Room
            </h2>
            <Link href="/deal-room" className="text-xs font-semibold text-navy-mid">
              Voir tout →
            </Link>
          </div>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                id={opp.id}
                title={opp.title}
                description={opp.description}
                type={opp.type}
                sector={opp.sector}
                budget={opp.budget}
                budgetEur={opp.budgetEur}
                deadline={opp.deadline}
                createdAt={opp.createdAt}
                author={opp.author}
              />
            ))}
          </div>
        </>
      )}

      {upcomingEvents.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
              Prochains événements
            </h2>
            <Link href="/evenements" className="text-xs font-semibold text-navy-mid">
              Voir tout →
            </Link>
          </div>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {upcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                id={event.id}
                title={event.title}
                type={event.type}
                date={event.date}
                location={event.location}
                isOnline={event.isOnline}
                price={event.price}
                capacityBadge={eventCapacityBadge(event.capacity, event._count.registrations)}
                isRegistered={event.registrations.length > 0}
              />
            ))}
          </div>
        </>
      )}

      {newMembers.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
              Nouveaux membres
            </h2>
            <Link href="/catalogue" className="text-xs font-semibold text-navy-mid">
              Voir les profils →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {newMembers.map((member) => (
              <MemberCard
                key={member.id}
                id={member.id}
                name={member.name}
                title={member.title}
                companyName={member.company?.name ?? null}
                country={member.country}
                avatarUrl={member.avatarUrl}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
