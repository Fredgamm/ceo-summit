/**
 * Module 21 lot 7 (3 nov. 2026) — fichier calendrier d'un rendez-vous B2B
 * confirmé (conception/21 P6, doc client §10). Logique pure, testée à part.
 *
 * Pensé pour que le même fichier s'ouvre proprement sur iPhone (Safari,
 * Mail), Android (Chrome, Gmail, Google Agenda, Samsung), Outlook et
 * Apple Calendar :
 * - fins de ligne CRLF et lignes repliées à 75 octets (sans couper un
 *   caractère UTF-8 accentué) : exigé par la RFC 5545, et Apple Calendar
 *   comme Outlook refusent ou tronquent les fichiers qui s'en écartent ;
 * - heures en UTC (« Z ») : aucun VTIMEZONE à embarquer, chaque appareil
 *   convertit dans son fuseau, y compris pour un participant en
 *   déplacement entre Madagascar (UTC+3) et La Réunion (UTC+4) ;
 * - METHOD:PUBLISH sans ORGANIZER ni ATTENDEE : c'est un simple
 *   « ajouter à mon agenda », sans demande de réponse (RSVP) ni invitation
 *   qui n'arriverait jamais à l'autre personne ;
 * - UID stable par rendez-vous : rouvrir le fichier met l'événement à jour
 *   au lieu d'en créer un doublon ;
 * - rappel (VALARM) 30 minutes avant, pris en charge par iOS et Android.
 */

export interface MeetingCalendarInput {
  bookingId: string;
  start: Date;
  end: Date;
  /** Titre de l'événement CEO Summit. */
  eventTitle: string;
  /** Lieu de l'événement (adresse ou ville). */
  eventLocation: string;
  /** Zone RDV B2B et indications pour la retrouver. */
  zone: string;
  accessInstructions: string;
  /** « 14 h 00, heure de La Réunion » : rappel du fuseau dans la description. */
  timezoneLabel: string;
  /** Heure de début affichée dans le fuseau de l'événement, déjà formatée. */
  startLabel: string;
  partner: {
    name: string;
    title: string | null;
    companyName: string | null;
    phone: string | null;
    email: string | null;
  };
  reason: string;
  /** Lien vers le profil public du partenaire. */
  partnerProfileUrl: string;
}

const CRLF = "\r\n";

/** RFC 5545 §3.3.11 — échappe \, ; , et les retours à la ligne. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 — une ligne ne dépasse pas 75 octets ; la suite commence par
 * une espace. On compte en octets UTF-8 et on ne coupe jamais au milieu d'un
 * caractère (« é », « — », emoji).
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // l'espace de continuation compte dans les 75 octets
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

/** « 20270111T060000Z » */
export function formatIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function meetingCalendarTitle(input: MeetingCalendarInput): string {
  const company = input.partner.companyName ? ` (${input.partner.companyName})` : "";
  return `RDV B2B — ${input.partner.name}${company}`;
}

export function meetingCalendarLocation(input: MeetingCalendarInput): string {
  return [input.zone, input.eventLocation].filter(Boolean).join(" — ");
}

/** Texte brut partagé par le fichier .ics et le lien Google Agenda. */
export function meetingCalendarDescription(input: MeetingCalendarInput): string {
  const { partner } = input;
  const lines = [
    `${input.eventTitle} — rendez-vous B2B`,
    `Heure : ${input.startLabel} (${input.timezoneLabel})`,
    "",
    "Avec :",
    `- ${partner.name}`,
    ...(partner.title ? [`- Fonction : ${partner.title}`] : []),
    ...(partner.companyName ? [`- Entreprise : ${partner.companyName}`] : []),
    ...(partner.phone ? [`- Téléphone : ${partner.phone}`] : []),
    ...(partner.email ? [`- Email : ${partner.email}`] : []),
    "",
    `Espace RDV : ${input.zone}`,
    ...(input.accessInstructions ? [`Indications : ${input.accessInstructions}`] : []),
    "",
    "Motif :",
    input.reason,
    "",
    `Profil : ${input.partnerProfileUrl}`,
  ];
  return lines.join("\n");
}

export function buildMeetingIcs(input: MeetingCalendarInput, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CEO Summit Indian Ocean//Networking B2B//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:meeting-${input.bookingId}@ceo-summit.mg`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(input.start)}`,
    `DTEND:${formatIcsUtc(input.end)}`,
    `SUMMARY:${escapeIcsText(meetingCalendarTitle(input))}`,
    `LOCATION:${escapeIcsText(meetingCalendarLocation(input))}`,
    `DESCRIPTION:${escapeIcsText(meetingCalendarDescription(input))}`,
    `URL:${input.partnerProfileUrl}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT30M",
    `DESCRIPTION:${escapeIcsText(`Rendez-vous B2B dans 30 minutes — ${input.zone}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/**
 * Lien « Ajouter à Google Agenda » : ouvre l'application Google Agenda sur
 * Android et le navigateur sur ordinateur, sans télécharger de fichier.
 */
export function googleCalendarUrl(input: MeetingCalendarInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meetingCalendarTitle(input),
    dates: `${formatIcsUtc(input.start)}/${formatIcsUtc(input.end)}`,
    details: meetingCalendarDescription(input),
    location: meetingCalendarLocation(input),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
