import { prisma } from "@/lib/prisma";
import {
  formatDayKey,
  formatTimeInZone,
  formatTimeRangeInZone,
  zonedDayKey,
} from "@/lib/event-timezone";
import {
  MEETING_STATUS_LABEL,
  meetingDisplayStatus,
  type MeetingDisplayStatus,
} from "@/lib/meeting-booking";

/**
 * Module 21 lot 9 (3 nov. 2026) — suivi par l'organisation (P7) : liste de
 * tous les rendez-vous d'un événement, filtres par statut et par jour, exports
 * CSV et PDF, liste terrain par créneau. Le tableau est construit une fois
 * (`MeetingTable`) puis rendu en écran, en CSV ou en PDF : mêmes données
 * partout.
 *
 * L'organisation voit **toutes** les informations des participants (nom,
 * fonction, entreprise, email, téléphone), quel que soit le statut du rendez-vous
 * : c'est ce qui lui permet de le gérer, de relancer ou d'aider sur place. Les
 * participants, eux, ne voient le téléphone de l'autre qu'après confirmation
 * (RG-04) ; cette règle ne concerne que leurs propres écrans et emails.
 */

export interface AdminMeetingFilters {
  /** Statut affiché ; absent ou « all » = tous. */
  status?: MeetingDisplayStatus | "all";
  /** Jour de l'événement, « AAAA-MM-JJ » dans son fuseau ; absent = tous. */
  day?: string;
}

export interface AdminMeetingParty {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
}

export interface AdminMeeting {
  id: string;
  status: MeetingDisplayStatus;
  dayKey: string;
  start: Date;
  end: Date;
  requester: AdminMeetingParty;
  recipient: AdminMeetingParty;
  reason: string;
  createdAt: Date;
  respondedAt: Date | null;
}

export interface AdminMeetingsView {
  event: {
    id: string;
    title: string;
    timezone: string;
    zone: string;
    accessInstructions: string;
  };
  /** Jours de l'événement ayant au moins un créneau publié, pour le filtre. */
  days: string[];
  /** Nombre de rendez-vous par statut, sur le jour filtré (tous statuts confondus). */
  counts: Record<MeetingDisplayStatus | "all", number>;
  meetings: AdminMeeting[];
}

const EMPTY_COUNTS = (): AdminMeetingsView["counts"] => ({
  all: 0,
  PENDING: 0,
  CONFIRMED: 0,
  COMPLETED: 0,
  DECLINED: 0,
  EXPIRED: 0,
  WITHDRAWN: 0,
  CANCELLED: 0,
});

const PARTY_SELECT = {
  id: true,
  name: true,
  title: true,
  email: true,
  phone: true,
  company: { select: { name: true } },
} as const;

export async function loadAdminMeetings(
  eventId: string,
  filters: AdminMeetingFilters = {},
  now = new Date()
): Promise<AdminMeetingsView | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      timezone: true,
      meetingSetup: { select: { zone: true, accessInstructions: true } },
      meetingSlots: {
        where: { status: { not: "DRAFT" } },
        select: { startTime: true },
        orderBy: { startTime: "asc" },
      },
      meetings: {
        orderBy: [{ slot: { startTime: "asc" } }, { createdAt: "asc" }],
        select: {
          id: true,
          status: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
          respondedAt: true,
          slot: { select: { startTime: true, endTime: true } },
          requester: { select: PARTY_SELECT },
          recipient: { select: PARTY_SELECT },
        },
      },
    },
  });
  if (!event) return null;

  const tz = event.timezone;
  const days = [...new Set(event.meetingSlots.map((s) => zonedDayKey(s.startTime, tz)))];

  const party = (user: (typeof event.meetings)[number]["requester"]): AdminMeetingParty => ({
    id: user.id,
    name: user.name,
    company: user.company?.name ?? "",
    title: user.title ?? "",
    email: user.email,
    phone: user.phone ?? "",
  });

  const counts = EMPTY_COUNTS();
  const meetings: AdminMeeting[] = [];
  for (const b of event.meetings) {
    const dayKey = zonedDayKey(b.slot.startTime, tz);
    if (filters.day && dayKey !== filters.day) continue;
    const status = meetingDisplayStatus(
      { status: b.status, expiresAt: b.expiresAt, endTime: b.slot.endTime },
      now
    );
    counts.all++;
    counts[status]++;
    if (filters.status && filters.status !== "all" && status !== filters.status) continue;
    meetings.push({
      id: b.id,
      status,
      dayKey,
      start: b.slot.startTime,
      end: b.slot.endTime,
      requester: party(b.requester),
      recipient: party(b.recipient),
      reason: b.reason,
      createdAt: b.createdAt,
      respondedAt: b.respondedAt,
    });
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      timezone: tz,
      zone: event.meetingSetup?.zone ?? "",
      accessInstructions: event.meetingSetup?.accessInstructions ?? "",
    },
    days,
    counts,
    meetings,
  };
}

/** Filtres lus dans l'URL ; une valeur inconnue revient à « tous ». */
export function parseAdminMeetingFilters(params: {
  statut?: string | null;
  jour?: string | null;
}): AdminMeetingFilters {
  const status = params.statut && params.statut in MEETING_STATUS_LABEL ? params.statut : undefined;
  const day = params.jour && /^\d{4}-\d{2}-\d{2}$/.test(params.jour) ? params.jour : undefined;
  return { status: status as MeetingDisplayStatus | undefined, day };
}

export interface MeetingTable {
  title: string;
  subtitle: string;
  header: string[];
  rows: string[][];
  /** Largeurs relatives des colonnes du PDF. */
  columnFlex: number[];
}

/** « Nom (fonction) » : la fonction accompagne le nom pour garder le tableau lisible. */
const person = (p: AdminMeetingParty) => (p.title ? `${p.name} (${p.title})` : p.name);

/** « 9 janvier 2027 à 12h00 » dans le fuseau de l'événement. */
const stamp = (date: Date | null, tz: string) =>
  date ? `${formatDayKey(zonedDayKey(date, tz))} à ${formatTimeInZone(date, tz)}` : "";

/**
 * Liste complète : tous les rendez-vous filtrés, quel que soit leur statut,
 * avec le motif. Tri par créneau.
 */
export function buildMeetingsListTable(view: AdminMeetingsView, filters: AdminMeetingFilters) {
  const tz = view.event.timezone;
  const scope = [
    filters.status && filters.status !== "all"
      ? MEETING_STATUS_LABEL[filters.status]
      : "Tous statuts",
    filters.day ? formatDayKey(filters.day) : "Tous les jours",
  ].join(" · ");
  const table: MeetingTable = {
    title: `Rendez-vous B2B — ${view.event.title}`,
    subtitle: `${scope} — ${view.meetings.length} rendez-vous — horaires dans le fuseau de l'événement`,
    header: [
      "Date",
      "Heure",
      "Statut",
      "Demandeur",
      "Entreprise du demandeur",
      "Email du demandeur",
      "Téléphone du demandeur",
      "Destinataire",
      "Entreprise du destinataire",
      "Email du destinataire",
      "Téléphone du destinataire",
      "Motif",
      "Demande envoyée le",
      "Réponse le",
    ],
    columnFlex: [1, 0.9, 0.8, 1.3, 1.2, 1.6, 1.1, 1.3, 1.2, 1.6, 1.1, 2, 1.2, 1.2],
    rows: view.meetings.map((m) => [
      formatDayKey(m.dayKey),
      formatTimeRangeInZone(m.start, m.end, tz),
      MEETING_STATUS_LABEL[m.status],
      person(m.requester),
      m.requester.company,
      m.requester.email,
      m.requester.phone,
      person(m.recipient),
      m.recipient.company,
      m.recipient.email,
      m.recipient.phone,
      m.reason,
      stamp(m.createdAt, tz),
      stamp(m.respondedAt, tz),
    ]),
  };
  return table;
}

/**
 * Liste terrain : seulement les rendez-vous confirmés ou terminés (ce qui
 * aura vraiment lieu), par créneau, avec de quoi joindre chaque personne.
 */
export function buildFieldListTable(view: AdminMeetingsView, filters: AdminMeetingFilters) {
  const tz = view.event.timezone;
  const held = view.meetings.filter((m) => m.status === "CONFIRMED" || m.status === "COMPLETED");
  const table: MeetingTable = {
    title: `Liste terrain — ${view.event.title}`,
    subtitle: [
      `Espace RDV : ${view.event.zone || "non défini"}`,
      filters.day ? formatDayKey(filters.day) : "Tous les jours",
      `${held.length} rendez-vous confirmé(s)`,
      "heures dans le fuseau de l'événement",
    ].join(" — "),
    header: [
      "Date",
      "Heure",
      "Participant 1",
      "Entreprise 1",
      "Email 1",
      "Téléphone 1",
      "Participant 2",
      "Entreprise 2",
      "Email 2",
      "Téléphone 2",
    ],
    columnFlex: [1.1, 1.1, 1.5, 1.4, 1.6, 1.1, 1.5, 1.4, 1.6, 1.1],
    rows: held.map((m) => [
      formatDayKey(m.dayKey),
      formatTimeRangeInZone(m.start, m.end, tz),
      person(m.requester),
      m.requester.company,
      m.requester.email,
      m.requester.phone,
      person(m.recipient),
      m.recipient.company,
      m.recipient.email,
      m.recipient.phone,
    ]),
  };
  return table;
}

/** La liste terrain, regroupée par jour puis par créneau, pour la page imprimable. */
export function groupFieldList(view: AdminMeetingsView) {
  const tz = view.event.timezone;
  const held = view.meetings.filter((m) => m.status === "CONFIRMED" || m.status === "COMPLETED");
  const days = new Map<string, Map<string, AdminMeeting[]>>();
  for (const m of held) {
    const slot = formatTimeRangeInZone(m.start, m.end, tz);
    const day = days.get(m.dayKey) ?? new Map<string, AdminMeeting[]>();
    day.set(slot, [...(day.get(slot) ?? []), m]);
    days.set(m.dayKey, day);
  }
  return [...days.entries()].map(([dayKey, slots]) => ({
    dayKey,
    label: formatDayKey(dayKey),
    slots: [...slots.entries()].map(([range, meetings]) => ({ range, meetings })),
  }));
}
