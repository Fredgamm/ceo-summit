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
import { formatDateFr, initials, meetsMinTier, tierLabel } from "@/lib/utils";

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
    include: {
      creditBalance: true,
      ...VIEWER_TIER_INCLUDE,
    },
  });
  if (!user) redirect("/login");

  const viewerTier = getViewerTierFromCompany(user.company);
  const companySubscription = user.company?.subscription;

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
  ]);

  const nextEvent = upcomingEvents[0] ?? null;

  const creditsAvailable =
    user.role === "CHAIRMAN"
      ? null
      : user.creditBalance
        ? user.creditBalance.included + user.creditBalance.purchased - user.creditBalance.used
        : 0;

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
        tier: tierLabel(viewerTier),
        avatarUrl: user.avatarUrl,
        isAdmin: user.role === "ADMIN",
      }}
      badges={{ messages: unreadMessages || undefined }}
      rightPanel={
        <div className="flex flex-col">
          <Link href="/profil" className="flex flex-col items-center gap-1 pb-5 text-center">
            <Avatar className="mb-1 h-16 w-16">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <p className="text-sm font-bold text-navy">{user.name}</p>
            <p className="text-xs text-text-muted">
              {[user.title, user.company?.name].filter(Boolean).join(" · ")}
            </p>
            <Badge
              variant={
                viewerTier === "CHAIRMAN"
                  ? "chairman"
                  : viewerTier === "EXECUTIVE"
                    ? "executive"
                    : "member"
              }
            >
              {tierLabel(viewerTier)}
            </Badge>
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

          <div className="border-t border-border py-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Crédits Deal Room
            </p>
            <div className="rounded-lg border border-gold-light bg-gold-pale px-3.5 py-3">
              <div className="text-xl font-bold text-navy">
                {creditsAvailable === null ? "Illimité" : creditsAvailable}
              </div>
              {creditsAvailable !== null && (
                <div className="text-[11.5px] text-text-muted">crédits disponibles</div>
              )}
            </div>
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

          <Button asChild className="mt-1 w-full">
            <Link href="/deal-room/publier">+ Publier une opportunité</Link>
          </Button>
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
              {formatDateFr(nextEvent.date)}
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

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-white px-5 py-4">
          <div className="text-2xl font-bold text-navy">
            {creditsAvailable === null ? "∞" : creditsAvailable}
          </div>
          <div className="mt-0.5 text-xs text-text-muted">Crédits Deal Room</div>
        </div>
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
                deadline={opp.deadline}
                createdAt={opp.createdAt}
                author={opp.author}
                authorTier={getViewerTierFromCompany(opp.author.company)}
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
                minTier={event.minTier}
                capacityBadge={eventCapacityBadge(event.capacity, event._count.registrations)}
                isRegistered={event.registrations.length > 0}
                tierOk={meetsMinTier(viewerTier, event.minTier)}
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
                role={member.role}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
