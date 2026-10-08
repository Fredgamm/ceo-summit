import { z } from "zod";

/**
 * E10 — agenda dynamique multi-salles (5 août 2026). `startTime`/`endTime`
 * viennent d'un `<input type="datetime-local">` (chaîne "YYYY-MM-DDTHH:mm",
 * pas de fuseau) — mêmes contraintes que `EventForm`/`eventFormSchema.date`.
 * Elles sont lues dans le fuseau de l'événement (module 21 D19).
 */
export const eventSessionFormSchema = z
  .object({
    title: z.string().trim().min(3, "Le titre doit contenir au moins 3 caractères").max(140),
    description: z.string().trim().max(1000).optional().default(""),
    room: z.string().trim().min(1, "La salle est requise").max(100),
    startTime: z
      .string()
      .min(1, "L'heure de début est requise")
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Heure de début invalide"),
    endTime: z
      .string()
      .min(1, "L'heure de fin est requise")
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Heure de fin invalide"),
    speakersText: z.string().optional().default(""),
  })
  .refine((v) => new Date(v.endTime) > new Date(v.startTime), {
    message: "L'heure de fin doit être après l'heure de début.",
    path: ["endTime"],
  });

export type EventSessionFormInput = z.input<typeof eventSessionFormSchema>;
