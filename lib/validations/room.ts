import { z } from "zod";

/** E8-T08 — "CRUD salles + gestion accès tier" (`bo-salles.html`). */
export const roomFormSchema = z.object({
  name: z.string().trim().min(3, "Le nom doit contenir au moins 3 caractères").max(80),
  description: z.string().trim().max(280).optional().default(""),
  sector: z.string().trim().min(1, "Le secteur est requis"),
  minTier: z.enum(["ALL_MEMBERS", "EXECUTIVE_PLUS", "CHAIRMAN_ONLY"]),
});

export type RoomFormInput = z.input<typeof roomFormSchema>;
