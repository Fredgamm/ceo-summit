import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Module 21 lot 6 (3 nov. 2026) — expiration des demandes de rendez-vous
 * restées sans réponse (RG-06, D13). Deux déclencheurs, une seule règle :
 * - à la lecture : répondre à une demande échue la fait expirer
 *   (`app/actions/meeting-requests.ts`) ;
 * - par la tâche planifiée (toutes les 5 minutes, `deploy/`), pour libérer
 *   les créneaux et prévenir les deux personnes au plus près de l'échéance.
 *
 * Le passage « en attente » → « expiré » est conditionnel : si la demande a
 * été acceptée, refusée ou retirée entre-temps, rien ne bouge. Les deux
 * créneaux redeviennent libres dans la même transaction (RG-07).
 */

/** RG-07 — les créneaux bloqués par la demande redeviennent libres. */
export async function releaseMeetingSlots(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.meetingParticipantSlot.updateMany({
    where: { bookingId },
    data: { status: "FREE", bookingId: null },
  });
}

/** Fait expirer une demande encore en attente ; `false` si elle a déjà changé d'état. */
export async function expireMeetingBooking(bookingId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.meetingBooking.updateMany({
      where: { id: bookingId, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    if (count !== 1) return false;
    await releaseMeetingSlots(tx, bookingId);
    return true;
  });
}

/** Une demande qui vient d'expirer, pour prévenir ses deux participants (lot 7). */
export interface ExpiredMeeting {
  id: string;
  requesterId: string;
  recipientId: string;
}

/** Au plus ce nombre de demandes par passage ; le suivant reprend le reste. */
const BATCH_SIZE = 200;

/**
 * Fait expirer toutes les demandes en attente dont l'échéance est passée.
 * Renvoie celles que ce passage a réellement fait expirer (pas celles qu'une
 * réponse a devancées entre-temps).
 */
export async function expireDueMeetings(now = new Date()): Promise<ExpiredMeeting[]> {
  const due = await prisma.meetingBooking.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, requesterId: true, recipientId: true },
  });

  const expired: ExpiredMeeting[] = [];
  for (const booking of due) {
    if (await expireMeetingBooking(booking.id)) expired.push(booking);
  }
  return expired;
}
