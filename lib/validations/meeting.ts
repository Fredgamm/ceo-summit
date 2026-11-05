import { z } from "zod";

import { SLOT_DURATIONS } from "@/lib/meeting-slots";

/** Module 21 lot 2 — réglages de l'option « Créneaux rendez-vous » d'un événement. */
export const meetingSetupSchema = z.object({
  zone: z.string().trim().min(2, "La zone RDV est requise").max(140),
  accessInstructions: z
    .string()
    .trim()
    .min(5, "Les indications d'accès sont requises")
    .max(1000, "Indications trop longues (1000 caractères max)"),
  slotDurationMinutes: z.coerce
    .number()
    .int()
    .refine((v) => (SLOT_DURATIONS as readonly number[]).includes(v), "Durée invalide"),
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Grille : jours de l'événement, plages horaires quotidiennes, durée.
 * 5 nov. 2026 : `ranges` (plusieurs plages, ex. 11:00–12:00 et 15:00–16:00)
 * remplace l'ancien couple plage + pause, toujours accepté.
 */
export const meetingGridSchema = z
  .object({
    days: z.array(z.string().regex(DAY)).min(1, "Choisissez au moins un jour"),
    ranges: z
      .array(
        z.object({
          start: z.string().regex(HHMM, "Heure de début invalide"),
          end: z.string().regex(HHMM, "Heure de fin invalide"),
        })
      )
      .max(12, "12 plages horaires au maximum")
      .optional(),
    dayStart: z.string().regex(HHMM, "Heure de début invalide").optional(),
    dayEnd: z.string().regex(HHMM, "Heure de fin invalide").optional(),
    durationMinutes: z.coerce.number().int(),
    pauseStart: z.string().optional().default(""),
    pauseEnd: z.string().optional().default(""),
  })
  .refine((v) => (v.ranges?.length ?? 0) > 0 || (v.dayStart && v.dayEnd), {
    message: "Ajoutez au moins une plage horaire",
  });

/** Ajout manuel d'un créneau. */
export const meetingSlotSchema = z.object({
  day: z.string().regex(DAY, "Jour invalide"),
  start: z.string().regex(HHMM, "Heure de début invalide"),
  end: z.string().regex(HHMM, "Heure de fin invalide"),
});

export type MeetingSetupInput = z.input<typeof meetingSetupSchema>;
export type MeetingGridInput = z.input<typeof meetingGridSchema>;
export type MeetingSlotInput = z.input<typeof meetingSlotSchema>;
