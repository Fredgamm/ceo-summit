import { z } from "zod";

// Backlog: "documents joints (R2, PDF 10Mo max)".
export const OPPORTUNITY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES = ["application/pdf"];
export const OPPORTUNITY_ATTACHMENT_MAX_COUNT = 3;

/**
 * E6-T03 — publication d'opportunité Deal Room, en 4 étapes côté formulaire.
 *
 * `type` (E8-T11, 5 août 2026) — était un enum Zod figé sur les 5 codes de
 * l'ex-enum Prisma `OpportunityType` ; validé comme `sector`/`country`
 * juste en dessous (chaîne non vide) depuis que ces trois champs sont des
 * référentiels admin-éditables (lib/referentials-query.ts), pas des
 * énumérations connues à la compilation.
 */
export const opportunityFormSchema = z.object({
  type: z.string().trim().min(1, "Le type d'opportunité est requis"),
  sector: z.string().trim().min(1, "Le secteur est requis"),
  country: z.string().trim().min(1, "La zone géographique est requise"),
  title: z.string().trim().min(10, "Le titre doit contenir au moins 10 caractères").max(140),
  description: z.string().trim().min(20, "La description doit contenir au moins 20 caractères"),
  budget: z.string().optional().default(""), // Ariary, parsed manually — optional per backlog
  // Rapport QA du 30 sept. 2026 — saisie optionnelle en euros, même logique
  // que `budget` (parsé manuellement, jamais lu pour le filtre/tri).
  budgetEur: z.string().optional().default(""),
  deadline: z.string().optional().default(""), // "YYYY-MM-DD", optional
  visibility: z.enum(["MEMBER", "EXECUTIVE", "CHAIRMAN"]),
  // Propriété des clés (préfixe `deal-room/<auteur>/`) vérifiée dans
  // app/actions/deal-room.ts — dépend de l'utilisateur courant.
  attachments: z
    .array(z.string().max(300))
    .max(OPPORTUNITY_ATTACHMENT_MAX_COUNT, "3 documents maximum")
    .default([]),
});

export type OpportunityFormInput = z.input<typeof opportunityFormSchema>;
