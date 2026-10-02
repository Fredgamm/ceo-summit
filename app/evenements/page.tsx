import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { RegistrationStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildUpcomingEventsWhere,
  buildPastEventsWhere,
  eventCapacityBadge,
  type EventsSearchParams,
} from "@/lib/events-query";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { EventFilters } from "@/components/events/event-filters";
import { EventCard } from "@/components/events/event-card";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Événements" };

const TAKEN_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING_PAYMENT"];

export default async function EventsPage({ searchParams }: { searchParams: EventsSearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const viewerTier = getViewerTierFromCompany(viewer.company);

  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: buildUpcomingEventsWhere(searchParams),
      orderBy: { date: "asc" },
      include: {
        registrations: {
          where: { userId: viewer.id, status: { in: TAKEN_STATUSES } },
          select: { id: true },
        },
        _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
      },
    }),
    prisma.event.findMany({
      where: buildPastEventsWhere(),
      orderBy: { date: "desc" },
      take: 6,
      include: {
        registrations: {
          where: { userId: viewer.id, status: { in: TAKEN_STATUSES } },
          select: { id: true },
        },
        _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
      },
    }),
  ]);
  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewerTier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-4">
        <h1 className="text-xl font-bold text-navy">Événements</h1>
      </div>

      <EventFilters />

      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucun événement à venir"
          description="Essayez d'autres filtres."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((event) => (
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
      )}

      {past.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-muted">
            Événements passés
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((event) => (
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
        </div>
      )}
    </AppShell>
  );
}
