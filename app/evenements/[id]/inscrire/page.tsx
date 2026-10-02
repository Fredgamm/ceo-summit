import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { RegistrationStatus } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { eventCapacityBadge } from "@/lib/events-query";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getActivePlans } from "@/lib/plans-query";
import { RegistrationWizard } from "@/components/events/registration-wizard";

export const metadata: Metadata = { title: "Inscription à l'événement" };

const TAKEN_STATUSES: RegistrationStatus[] = ["CONFIRMED", "PENDING_PAYMENT"];

/**
 * E3-T03 — server-side re-validation of every condition the /evenements/[id]
 * CTA already encodes (platform access, capacity, already registered, event
 * date) — the disabled button there is a UX hint, not the actual gate.
 */
export default async function EventRegistrationPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [event, viewer] = await Promise.all([
    prisma.event.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { registrations: { where: { status: { in: TAKEN_STATUSES } } } } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: VIEWER_TIER_INCLUDE,
    }),
  ]);

  if (!event || event.status !== "PUBLISHED") notFound();
  if (!viewer) redirect("/login");

  const hasAccess = getViewerTierFromCompany(viewer.company) != null;
  const isPast = event.date < new Date();
  const capacity = eventCapacityBadge(event.capacity, event._count.registrations);

  const [alreadyRegistered, eventOffers] = await Promise.all([
    prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
    }),
    getActivePlans({ selfServiceOnly: true, eventId: event.id }),
  ]);

  if (
    !hasAccess ||
    isPast ||
    capacity === "complet" ||
    (alreadyRegistered && alreadyRegistered.status !== "CANCELLED") ||
    eventOffers.length > 0
  ) {
    redirect(`/evenements/${event.id}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <RegistrationWizard
        eventId={event.id}
        eventTitle={event.title}
        eventDate={event.date}
        eventLocation={event.location}
        isOnline={event.isOnline}
        price={event.price}
        viewer={{
          name: viewer.name,
          title: viewer.title ?? "",
          email: viewer.email,
          companyName: viewer.company?.name ?? null,
        }}
      />
    </div>
  );
}
