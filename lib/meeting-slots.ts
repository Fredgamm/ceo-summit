import { zonedDayKey, zonedLocalToUtc } from "@/lib/event-timezone";

/**
 * Module 21 lot 2 (8 oct. 2026) — grille des créneaux de rendez-vous B2B
 * (conception/21 §3.0 étape 4 et P1). Logique pure : la page admin et les
 * actions serveur s'appuient dessus.
 */

export const SLOT_DURATIONS = [15, 20, 30, 45, 60] as const;

/** Garde-fou contre une grille aberrante (ex. 15 min sur 10 jours). */
export const MAX_SLOTS_PER_GENERATION = 400;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** « 09:30 » → 570. `null` si le format n'est pas HH:mm. */
export function timeToMinutes(value: string): number | null {
  const m = TIME_RE.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToTime(total: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Jours calendaires de l'événement dans son fuseau (« 2027-03-12 », …), du
 * jour de début au jour de fin inclus. Sans fin, le seul jour de début.
 */
export function eventDayKeys(start: Date, end: Date | null, timeZone: string): string[] {
  const first = zonedDayKey(start, timeZone);
  const last = end ? zonedDayKey(end, timeZone) : first;
  const days: string[] = [];
  // Midi UTC : avancer d'un jour ne bascule jamais de date par erreur.
  const cursor = new Date(`${first}T12:00:00Z`);
  while (days.length < 31) {
    const key = cursor.toISOString().slice(0, 10);
    if (key > last) break;
    days.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Une plage horaire quotidienne, « HH:mm » → « HH:mm ». */
export interface TimeRange {
  start: string;
  end: string;
}

export interface GridInput {
  /** Jours retenus (« 2027-03-12 »), parmi ceux de l'événement. */
  days: string[];
  /**
   * 5 nov. 2026 — plages horaires de chaque jour (ex. 11:00–12:00 et
   * 15:00–16:00), découpées chacune en créneaux. Quand elles sont fournies,
   * `dayStart`/`dayEnd`/pause sont ignorés.
   */
  ranges?: TimeRange[] | null;
  /** Ancien format : une plage quotidienne unique, « HH:mm ». */
  dayStart?: string | null;
  dayEnd?: string | null;
  durationMinutes: number;
  /** Ancien format : pause optionnelle, « HH:mm » : aucun créneau ne la chevauche. */
  pauseStart?: string | null;
  pauseEnd?: string | null;
  timeZone: string;
}

export type GridResult =
  { ok: true; slots: { startTime: Date; endTime: Date }[] } | { ok: false; error: string };

type ParsedRanges =
  { ok: true; ranges: [number, number][]; pause?: [number, number] } | { ok: false; error: string };

/** Plages en minutes, triées, sans chevauchement. L'ancien format (plage + pause) devient 1 ou 2 plages. */
function parseRanges(input: GridInput): ParsedRanges {
  if (input.ranges && input.ranges.length > 0) {
    const ranges: [number, number][] = [];
    for (const r of input.ranges) {
      const s = timeToMinutes(r.start);
      const e = timeToMinutes(r.end);
      if (s === null || e === null) return { ok: false, error: "Heures invalides." };
      if (e <= s) {
        return { ok: false, error: `Plage ${r.start}–${r.end} : la fin doit être après le début.` };
      }
      ranges.push([s, e]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i][0] < ranges[i - 1][1]) {
        return { ok: false, error: "Deux plages horaires se chevauchent." };
      }
    }
    return { ok: true, ranges };
  }

  const start = timeToMinutes(input.dayStart ?? "");
  const end = timeToMinutes(input.dayEnd ?? "");
  if (start === null || end === null) return { ok: false, error: "Heures invalides." };
  if (end <= start) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };
  if (!input.pauseStart && !input.pauseEnd) return { ok: true, ranges: [[start, end]] };
  const ps = timeToMinutes(input.pauseStart ?? "");
  const pe = timeToMinutes(input.pauseEnd ?? "");
  if (ps === null || pe === null) return { ok: false, error: "Heures de pause invalides." };
  if (pe <= ps) return { ok: false, error: "La fin de la pause doit être après son début." };
  // Comportement historique : un créneau qui chevauche la pause est sauté
  // (et non raccourci), donc la reprise se cale sur la grille du matin.
  return { ok: true, ranges: [[start, end]], pause: [ps, pe] };
}

/**
 * Découpe chaque plage de chaque jour retenu en créneaux consécutifs de
 * `durationMinutes`. Les heures sont celles du fuseau de l'événement (D19),
 * stockées en UTC.
 */
export function buildSlotGrid(input: GridInput): GridResult {
  const parsed = parseRanges(input);
  if (!parsed.ok) return parsed;
  const pause = parsed.pause ?? null;
  if (!(SLOT_DURATIONS as readonly number[]).includes(input.durationMinutes)) {
    return { ok: false, error: "Durée de créneau invalide." };
  }
  if (input.days.length === 0) return { ok: false, error: "Choisissez au moins un jour." };

  const slots: { startTime: Date; endTime: Date }[] = [];
  for (const day of [...new Set(input.days)].sort()) {
    for (const [start, end] of parsed.ranges)
      for (let t = start; t + input.durationMinutes <= end; t += input.durationMinutes) {
        const slotEnd = t + input.durationMinutes;
        if (pause && t < pause[1] && slotEnd > pause[0]) continue;
        const startTime = zonedLocalToUtc(`${day}T${minutesToTime(t)}`, input.timeZone);
        const endTime = zonedLocalToUtc(`${day}T${minutesToTime(slotEnd)}`, input.timeZone);
        if (!startTime || !endTime) return { ok: false, error: "Jour invalide." };
        slots.push({ startTime, endTime });
        if (slots.length > MAX_SLOTS_PER_GENERATION) {
          return {
            ok: false,
            error: `Trop de créneaux (plus de ${MAX_SLOTS_PER_GENERATION}) : réduisez la plage ou allongez la durée.`,
          };
        }
      }
  }
  if (slots.length === 0) {
    return {
      ok: false,
      error: "Aucun créneau : chaque plage horaire est plus courte qu'un rendez-vous.",
    };
  }
  return { ok: true, slots };
}
