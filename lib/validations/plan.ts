import { z } from "zod";

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — "offres créables librement
 * par l'admin". `maxTeamMembers` n'a de sens que pour `scope: COMPANY`, mais
 * ce n'est pas imposé ici (un plan individuel avec un plafond ignoré est
 * inoffensif) — l'application, elle, ne le lit que pour les plans COMPANY.
 */
export const planFormSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(60),
  description: z.string().trim().max(500).optional().default(""),
  scope: z.enum(["INDIVIDUAL", "COMPANY"]),
  priceAr: z.coerce.number().int().min(0, "Le prix ne peut pas être négatif"),
  maxTeamMembers: z.coerce.number().int().min(1).optional().nullable(),
  includedCredits: z.coerce.number().int().min(0).default(0),
  hasUnlimitedCredits: z.coerce.boolean().default(false),
  rank: z.coerce.number().int().min(1, "Le rang doit être un entier positif"),
  eligibilityNote: z.string().trim().max(500).optional().default(""),
  isActive: z.coerce.boolean().default(true),
  displayOrder: z.coerce.number().int().default(0),
});

export type PlanFormInput = z.input<typeof planFormSchema>;
