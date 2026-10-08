/**
 * Module 21 D19 (8 oct. 2026) — fuseau horaire réglé par événement.
 *
 * Toutes les heures d'un événement (début, fin, Programme, créneaux de
 * rendez-vous, échéances) sont saisies et affichées dans le fuseau de
 * l'événement, quel que soit le fuseau du serveur ou du visiteur, et
 * stockées en UTC. Avant ce module, les saisies `datetime-local` étaient
 * interprétées à l'heure du serveur (UTC en production) : voir la migration
 * `event_timezone` pour le recalage des données existantes.
 */

export const DEFAULT_EVENT_TIMEZONE = "Indian/Antananarivo";

export const EVENT_TIMEZONES: { value: string; label: string; place: string }[] = [
  { value: "Indian/Antananarivo", label: "Madagascar (UTC+3)", place: "Madagascar" },
  { value: "Indian/Reunion", label: "La Réunion (UTC+4)", place: "La Réunion" },
  { value: "Indian/Mauritius", label: "Maurice (UTC+4)", place: "Maurice" },
  { value: "Indian/Mayotte", label: "Mayotte (UTC+3)", place: "Mayotte" },
  { value: "Indian/Comoro", label: "Comores (UTC+3)", place: "Comores" },
  { value: "Indian/Mahe", label: "Seychelles (UTC+4)", place: "Seychelles" },
  { value: "Africa/Johannesburg", label: "Afrique du Sud (UTC+2)", place: "Afrique du Sud" },
  { value: "Africa/Nairobi", label: "Kenya (UTC+3)", place: "Kenya" },
  { value: "Europe/Paris", label: "Paris (UTC+1, UTC+2 en été)", place: "Paris" },
];

export const EVENT_TIMEZONE_VALUES = EVENT_TIMEZONES.map((t) => t.value) as [string, ...string[]];

export function isEventTimezone(value: string): boolean {
  return EVENT_TIMEZONES.some((t) => t.value === value);
}

/** « heure de La Réunion » — mention affichée à côté de toute heure d'événement. */
export function timezoneLabel(timeZone: string): string {
  const place = EVENT_TIMEZONES.find((t) => t.value === timeZone)?.place;
  return place ? `heure de ${place}` : `heure locale (${timeZone})`;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function zonedParts(date: Date, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Décalage du fuseau à cet instant, en minutes (La Réunion : +240). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Saisie `datetime-local` (« 2027-03-12T14:00 », sans fuseau) lue comme une
 * heure du fuseau de l'événement → instant UTC. `null` si la chaîne n'a pas
 * ce format.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Deux passes : le décalage peut changer autour d'un passage à l'heure d'été.
  let instant = wallAsUtc - offsetMinutes(new Date(wallAsUtc), timeZone) * 60_000;
  instant = wallAsUtc - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** Instant UTC → valeur d'un `<input type="datetime-local">` dans le fuseau. */
export function utcToZonedLocal(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Jour calendaire dans le fuseau (« 2027-03-12 »), pour grouper par jour. */
export function zonedDayKey(date: Date, timeZone: string): string {
  return utcToZonedLocal(date, timeZone).slice(0, 10);
}

/** « 14h00 » dans le fuseau. */
export function formatTimeInZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${pad(p.hour)}h${pad(p.minute)}`;
}

/** « 14h00 – 15h30 » dans le fuseau. */
export function formatTimeRangeInZone(start: Date, end: Date, timeZone: string): string {
  return `${formatTimeInZone(start, timeZone)} – ${formatTimeInZone(end, timeZone)}`;
}

/** Libellé d'un jour « 2027-03-12 » (issu de `zonedDayKey`) : « 12 mars 2027 ». */
export function formatDayKey(dayKey: string): string {
  // Midi UTC : le jour ne bascule dans aucun fuseau d'affichage.
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T12:00:00Z`));
}

/** ISO 8601 avec le décalage du fuseau : « 2027-03-12T14:00:00+04:00 ». */
export function toZonedIso(date: Date, timeZone: string): string {
  const offset = offsetMinutes(date, timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${utcToZonedLocal(date, timeZone)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
