import { z } from "zod";

/** E8-T08 — "CRUD salles + gestion accès tier" (`bo-salles.html`). */
export const roomFormSchema = z.object({
  name: z.string().trim().min(3, "Le nom doit contenir au moins 3 caractères").max(80),
  description: z.string().trim().max(280).optional().default(""),
  sector: z.string().trim().min(1, "Le secteur est requis"),
  minTier: z.enum(["ALL_MEMBERS", "EXECUTIVE_PLUS", "CHAIRMAN_ONLY"]),
});

export type RoomFormInput = z.input<typeof roomFormSchema>;

/**
 * B4 (audit sécurité du 29 juillet 2026) — E4-T03 "upload fichier dans le
 * chat" avait aucune whitelist MIME (seule la taille était vérifiée),
 * laissant un membre stocker un `.html`/`.svg` arbitraire. Images + PDF
 * couvre l'usage réel (capture d'écran, document partagé).
 */
export const ROOM_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ROOM_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
