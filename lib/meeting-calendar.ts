import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { formatDayKey, formatTimeInZone, timezoneLabel, zonedDayKey } from "@/lib/event-timezone";
import { meetingDisplayStatus } from "@/lib/meeting-booking";
import type { MeetingCalendarInput } from "@/lib/meeting-ics";

/**
 * Module 21 lot 7 (3 nov. 2026) — données du fichier calendrier d'un
 * rendez-vous, du point de vue d'un des deux participants. Sert la route
 * `/api/rendez-vous/[id]/ics` et, plus tard, les emails de confirmation.
 *
 * Le fichier n'existe que pour un rendez-vous confirmé ou terminé (doc client
 * §10) : c'est aussi la seule situation où le téléphone du partenaire peut
 * être communiqué (RG-04).
 */
export type MeetingCalendarResult =
  { ok: true; input: MeetingCalendarInput } | { ok: false; reason: "not-found" | "not-confirmed" };

export async function loadMeetingCalendarInput(
  bookingId: string,
  viewerId: string,
  now = new Date()
): Promise<MeetingCalendarResult> {
  const booking = await prisma.meetingBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      reason: true,
      expiresAt: true,
      requesterId: true,
      recipientId: true,
      slot: { select: { startTime: true, endTime: true } },
      event: {
        select: {
          title: true,
          location: true,
          timezone: true,
          meetingSetup: { select: { zone: true, accessInstructions: true } },
        },
      },
      requester: { select: PARTNER_SELECT },
      recipient: { select: PARTNER_SELECT },
    },
  });
  // Un rendez-vous d'autrui n'est pas distingué d'un rendez-vous inexistant.
  if (!booking || (booking.requesterId !== viewerId && booking.recipientId !== viewerId)) {
    return { ok: false, reason: "not-found" };
  }
  const status = meetingDisplayStatus(
    { status: booking.status, expiresAt: booking.expiresAt, endTime: booking.slot.endTime },
    now
  );
  if (status !== "CONFIRMED" && status !== "COMPLETED") {
    return { ok: false, reason: "not-confirmed" };
  }

  const partner = booking.requesterId === viewerId ? booking.recipient : booking.requester;
  const tz = booking.event.timezone;
  return {
    ok: true,
    input: {
      bookingId: booking.id,
      start: booking.slot.startTime,
      end: booking.slot.endTime,
      eventTitle: booking.event.title,
      eventLocation: booking.event.location,
      zone: booking.event.meetingSetup?.zone ?? "",
      accessInstructions: booking.event.meetingSetup?.accessInstructions ?? "",
      timezoneLabel: timezoneLabel(tz),
      startLabel: `${formatDayKey(zonedDayKey(booking.slot.startTime, tz))}, ${formatTimeInZone(booking.slot.startTime, tz)}`,
      partner: {
        name: partner.name,
        title: partner.title,
        companyName: partner.company?.name ?? null,
        phone: partner.phone,
        email: partner.email,
      },
      reason: booking.reason,
      partnerProfileUrl: `${appUrl()}/membres/${partner.id}`,
    },
  };
}

const PARTNER_SELECT = {
  id: true,
  name: true,
  title: true,
  phone: true,
  email: true,
  company: { select: { name: true } },
} as const;
