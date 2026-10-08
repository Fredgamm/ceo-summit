import { z } from "zod";

import { DEFAULT_EVENT_TIMEZONE, EVENT_TIMEZONE_VALUES } from "@/lib/event-timezone";
import { EVENT_ATTACHMENT_MAX_BYTES, EVENT_ATTACHMENT_MAX_COUNT } from "@/lib/event-attachments";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** E3-T05 — admin event create/edit form. */
export const eventFormSchema = z
  .object({
    title: z.string().trim().min(3, "Le titre doit contenir au moins 3 caractères"),
    type: z.enum(["SUMMIT", "DINER", "WEBINAIRE", "RENCONTRE"]),
    description: z.string().trim().min(10, "La description doit contenir au moins 10 caractères"),
    location: z.string().trim().min(1, "Le lieu est requis"),
    isOnline: z.boolean().default(false),
    zoomMeetingId: z.string().optional().default(""),
    /**
     * Module 21 D19 — `date`/`endDate` sont des saisies `datetime-local`
     * (« 2027-03-12T14:00 ») lues dans ce fuseau, pas dans celui du serveur.
     */
    timezone: z.enum(EVENT_TIMEZONE_VALUES).default(DEFAULT_EVENT_TIMEZONE),
    date: z
      .string()
      .min(1, "La date de début est requise")
      .regex(LOCAL_DATETIME, "Date de début invalide"),
    /** Intégration Evolia (8 oct. 2026) — fin de l'événement, transmise avec le début. */
    endDate: z
      .string()
      .min(1, "La date de fin est requise")
      .regex(LOCAL_DATETIME, "Date de fin invalide"),
    capacity: z.coerce.number().int().positive("La capacité doit être positive"),
    price: z.coerce.number().int().min(0, "Le prix ne peut pas être négatif"),
    imageUrl: z.string().optional().default(""),
    /**
     * Module 21 D17 — pièces jointes, dans l'ordre d'affichage. Chacune a été
     * envoyée au préalable par /api/admin/events/attachment ; l'action
     * vérifie que l'URL vient bien de là.
     */
    attachments: z
      .array(
        z.object({
          title: z.string().trim().min(1, "Donnez un titre à chaque pièce jointe").max(140),
          url: z.string().min(1).max(500),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(120),
          sizeBytes: z.number().int().positive().max(EVENT_ATTACHMENT_MAX_BYTES),
        })
      )
      .max(EVENT_ATTACHMENT_MAX_COUNT, `${EVENT_ATTACHMENT_MAX_COUNT} pièces jointes au maximum`)
      .default([]),
  })
  .refine((v) => new Date(v.endDate) > new Date(v.date), {
    message: "La fin doit être après le début.",
    path: ["endDate"],
  });

export type EventFormInput = z.input<typeof eventFormSchema>;

// Wireframe bo-evenement-form.html — "PNG, JPG · Max 5 Mo · Ratio 16:9 recommandé".
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_IMAGE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const EVENT_IMAGE_WIDTH = 1200;
export const EVENT_IMAGE_HEIGHT = 675;
