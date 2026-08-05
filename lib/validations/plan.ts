import { z } from "zod";

/**
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — "offres créables
 * librement par l'admin", toutes entreprise (le scope INDIVIDUAL a été
 * retiré du modèle). Une offre est soit une **offre plateforme**
 * (`eventId` vide — avantages permanents : `maxTeamMembers`,
 * `includedCredits`, etc.), soit une **offre d'évènement** (`eventId`
 * renseigné — modalités d'accès à cette édition : `pricingMode`, `priceAr`,
 * `minParticipants`/`includedSeats`, `linkedPlatformPlanId`). Non imposé au
 * niveau du schéma (même convention que le reste de ce fichier) —
 * l'application ne lit ces champs que dans le bon contexte.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const planFormSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Le slug doit contenir au moins 2 caractères")
    .max(80)
    .regex(SLUG_PATTERN, "Le slug ne peut contenir que des minuscules, chiffres et tirets"),
  description: z.string().trim().max(500).optional().default(""),
  priceAr: z.coerce.number().int().min(0, "Le prix ne peut pas être négatif"),
  maxTeamMembers: z.coerce.number().int().min(1).optional().nullable(),
  minParticipants: z.coerce.number().int().min(1).optional().nullable(),
  /// Offre d'évènement uniquement — sans objet pour une offre plateforme.
  pricingMode: z.enum(["PER_PARTICIPANT", "FIXED_BUNDLE"]).optional().nullable(),
  /// Nombre de sièges du forfait — pertinent seulement si pricingMode = FIXED_BUNDLE.
  includedSeats: z.coerce.number().int().min(1).optional().nullable(),
  includedCredits: z.coerce.number().int().min(0).default(0),
  hasUnlimitedCredits: z.coerce.boolean().default(false),
  rank: z.coerce.number().int().min(1, "Le rang doit être un entier positif"),
  eligibilityNote: z.string().trim().max(500).optional().default(""),
  isActive: z.coerce.boolean().default(true),
  isSelfService: z.coerce.boolean().default(true),
  displayOrder: z.coerce.number().int().default(0),
  /// Phase 2quater (1er août 2026) — rattache l'offre à un évènement
  /// précis ; chaîne vide = offre standard plateforme (eventId: null).
  eventId: z.string().trim().optional().default(""),
  /// 4 août 2026 (split plateforme/évènement) — offre plateforme dont
  /// hériter les avantages ; chaîne vide = aucun lien (offre plateforme
  /// elle-même, ou offre d'évènement pas encore migrée).
  linkedPlatformPlanId: z.string().trim().optional().default(""),
});

export type PlanFormInput = z.input<typeof planFormSchema>;
