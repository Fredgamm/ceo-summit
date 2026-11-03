import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { formatDayKey, formatTimeInZone, zonedDayKey } from "@/lib/event-timezone";

/**
 * Notifications de l'application (3 nov. 2026) — première version, **sans
 * nouvelle table** : ce qui attend une réponse du membre est déduit des
 * données existantes. La plateforme n'avait ni cloche ni centre de
 * notifications ; la barre du haut (mobile) en a maintenant une.
 *
 * Le compteur de la cloche ne reprend que ce qui demande une réponse (demandes
 * de rendez-vous B2B, demandes de contact du Deal Room). Les messages non lus
 * ont déjà leur pastille dans la barre du bas, et figurent dans la page.
 */

/** Demandes de rendez-vous reçues, encore en attente de réponse et pas échues. */
const PENDING_MEETINGS = (userId: string, now: Date) => ({
  recipientId: userId,
  status: "PENDING" as const,
  expiresAt: { gt: now },
});

export async function countNotifications(userId: string, now = new Date()): Promise<number> {
  const [meetings, contacts] = await Promise.all([
    prisma.meetingBooking.count({ where: PENDING_MEETINGS(userId, now) }),
    prisma.opportunityContact.count({ where: { receiverId: userId, status: "PENDING" } }),
  ]);
  return meetings + contacts;
}

export interface NotificationItem {
  id: string;
  kind: "meeting" | "deal-room";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

export interface NotificationsView {
  items: NotificationItem[];
  unreadMessages: number;
}

const MAX_ITEMS = 20;

export async function loadNotifications(
  userId: string,
  now = new Date()
): Promise<NotificationsView> {
  const [meetings, contacts, unreadMessages] = await Promise.all([
    prisma.meetingBooking.findMany({
      where: PENDING_MEETINGS(userId, now),
      orderBy: { expiresAt: "asc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        slot: { select: { startTime: true } },
        event: { select: { timezone: true } },
        requester: { select: { name: true, company: { select: { name: true } } } },
      },
    }),
    prisma.opportunityContact.findMany({
      where: { receiverId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        opportunityId: true,
        opportunity: { select: { title: true } },
        initiator: { select: { name: true, company: { select: { name: true } } } },
      },
    }),
    countUnreadMessages(userId),
  ]);

  const who = (u: { name: string; company: { name: string } | null }) =>
    [u.name, u.company?.name].filter(Boolean).join(", ");

  const items: NotificationItem[] = [
    ...meetings.map((m) => ({
      id: `meeting-${m.id}`,
      kind: "meeting" as const,
      title: `${who(m.requester)} vous demande un rendez-vous`,
      detail: `${formatDayKey(zonedDayKey(m.slot.startTime, m.event.timezone))}, ${formatTimeInZone(m.slot.startTime, m.event.timezone)}`,
      href: "/profil?onglet=mes-rendez-vous",
      actionLabel: "Répondre",
    })),
    ...contacts.map((c) => ({
      id: `contact-${c.id}`,
      kind: "deal-room" as const,
      title: `${who(c.initiator)} souhaite vous contacter`,
      detail: `Opportunité « ${c.opportunity.title} »`,
      href: `/deal-room/${c.opportunityId}`,
      actionLabel: "Voir",
    })),
  ];
  return { items, unreadMessages };
}
