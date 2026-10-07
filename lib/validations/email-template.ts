import { z } from "zod";

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — formulaire de l'éditeur admin (`/admin/emails/[key]`). Les
 * longueurs plafonnées bornent surtout le coût de rendu de l'aperçu et la
 * taille du JSON stocké, pas un vrai risque de sécurité (aucun HTML brut
 * n'est jamais accepté, voir lib/email-blocks.ts).
 */
const idSchema = z.string().min(1);
const shortTextSchema = z.string().trim().min(1, "Ce champ est requis").max(200);
const paragraphTextSchema = z.string().trim().min(1, "Ce champ est requis").max(2000);
const urlLikeSchema = z.string().trim().min(1, "L'URL est requise").max(500);

export const emailBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: idSchema, type: z.literal("heading"), text: shortTextSchema }),
  z.object({ id: idSchema, type: z.literal("paragraph"), text: paragraphTextSchema }),
  z.object({ id: idSchema, type: z.literal("button"), label: shortTextSchema, url: urlLikeSchema }),
  z.object({ id: idSchema, type: z.literal("divider") }),
  z.object({
    id: idSchema,
    type: z.literal("list"),
    style: z.enum(["bullet", "number"]),
    items: z.array(paragraphTextSchema).min(1, "Au moins un élément").max(20),
  }),
]);

export const emailTemplateFormSchema = z.object({
  subject: z.string().trim().min(1, "L'objet est requis").max(200),
  blocks: z.array(emailBlockSchema).min(1, "Au moins un bloc est requis").max(40),
});

export type EmailTemplateFormInput = z.infer<typeof emailTemplateFormSchema>;
