import { prisma } from "@/lib/prisma";
import { sendMeetingCancelledEmails } from "@/lib/meeting-emails";

/**
 * Module 21 lot 7 (3 nov. 2026, RG-14) — un participant retiré de la liste
 * par son gérant voit ses demandes en attente et ses rendez-vous confirmés
 * annulés, et les deux personnes de chacun en sont prévenues. Les créneaux
 * bloqués par ces demandes redeviennent libres.
 */
export const CANCELLED_PARTICIPANT_REMOVED =
  "Participant retiré de la liste des participants de l'événement.";

export async function cancelMeetingsOfRemovedParticipants(
  eventId: string,
  userIds: string[]
): Promise<number> {
  if (userIds.length === 0) return 0;
  const bookings = await prisma.meetingBooking.findMany({
    where: {
      eventId,
      status: { in: ["PENDING", "CONFIRMED"] },
      OR: [{ requesterId: { in: userIds } }, { recipientId: { in: userIds } }],
    },
    select: { id: true, status: true },
  });
  if (bookings.length === 0) return 0;

  const ids = bookings.map((b) => b.id);
  await prisma.$transaction([
    prisma.meetingBooking.updateMany({
      where: { id: { in: ids }, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", cancelReason: CANCELLED_PARTICIPANT_REMOVED },
    }),
    prisma.meetingParticipantSlot.updateMany({
      where: { bookingId: { in: ids } },
      data: { status: "FREE", bookingId: null },
    }),
  ]);

  sendMeetingCancelledEmails(
    bookings.map((b) => ({ id: b.id, wasConfirmed: b.status === "CONFIRMED" }))
  ).catch((err) => console.error("[meeting-email] annulation non envoyée", err));
  return bookings.length;
}
