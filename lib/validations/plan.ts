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

const basePlanFormSchema = z.object({
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
  /// 3 septembre 2026 — prix officiel en euros pour une offre du catalogue
  /// de sponsoring ; `priceAr` est alors recalculé côté serveur à partir du
  /// taux du jour (jamais fait confiance à une valeur envoyée par le
  /// client). Absent/vide = offre cotée directement en Ariary (comportement
  /// historique).
  priceEur: z.coerce
    .number()
    .int()
    .min(0, "Le prix ne peut pas être négatif")
    .optional()
    .nullable(),
  maxTeamMembers: z.coerce.number().int().min(1).optional().nullable(),
  minParticipants: z.coerce.number().int().min(1).optional().nullable(),
  /// Offre d'évènement uniquement — sans objet pour une offre plateforme.
  pricingMode: z.enum(["PER_PARTICIPANT", "FIXED_BUNDLE", "TIERED_GROUP"]).optional().nullable(),
  /// Nombre de sièges du forfait — pertinent seulement si pricingMode = FIXED_BUNDLE.
  includedSeats: z.coerce.number().int().min(1).optional().nullable(),
  /// 14 septembre 2026 — paliers de prix par taille de groupe, pertinent
  /// seulement si pricingMode = TIERED_GROUP (voir PlanPriceBracket). Comme
  /// pour priceEur/priceAr, unitPriceEur (si renseigné) est la source, et
  /// unitPriceAr est recalculé côté serveur au taux du jour.
  priceBrackets: z
    .array(
      z.object({
        minParticipants: z.coerce.number().int().min(1),
        maxParticipants: z.coerce.number().int().min(1).optional().nullable(),
        unitPriceAr: z.coerce.number().int().min(0),
        unitPriceEur: z.coerce.number().int().min(0).optional().nullable(),
      })
    )
    .optional()
    .default([]),
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
  /// elle-même).
  linkedPlatformPlanId: z.string().trim().optional().default(""),
});

/**
 * 4 août 2026 (split plateforme/évènement) — pour toute offre d'évènement
 * (eventId renseigné), le lien vers une offre plateforme est obligatoire
 * (RG-13/UC-10 : aucune offre d'évènement existante en base au moment de
 * cette décision, pas de rétrocompatibilité à gérer). En mode FIXED_BUNDLE,
 * includedSeats est obligatoire.
 */
export const planFormSchema = basePlanFormSchema.superRefine((data, ctx) => {
  if (data.eventId) {
    if (!data.linkedPlatformPlanId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["linkedPlatformPlanId"],
        message: "Une offre plateforme associée est requise pour une offre d'évènement.",
      });
    }
    if (data.pricingMode === "FIXED_BUNDLE" && !data.includedSeats) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["includedSeats"],
        message: "Le nombre de sièges est requis pour un forfait fixe.",
      });
    }
  }
  if (data.pricingMode === "TIERED_GROUP") {
    if (data.priceBrackets.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceBrackets"],
        message: "Au moins un palier est requis pour une tarification par palier.",
      });
    } else {
      const sorted = [...data.priceBrackets].sort((a, b) => a.minParticipants - b.minParticipants);
      sorted.forEach((bracket, i) => {
        if (bracket.maxParticipants != null && bracket.maxParticipants < bracket.minParticipants) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["priceBrackets"],
            message: `Le palier à partir de ${bracket.minParticipants} a une borne haute inférieure à sa borne basse.`,
          });
        }
        const isLast = i === sorted.length - 1;
        if (bracket.maxParticipants == null && !isLast) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["priceBrackets"],
            message: "Seul le dernier palier peut être ouvert (sans borne haute).",
          });
        }
        const next = sorted[i + 1];
        if (
          next &&
          bracket.maxParticipants != null &&
          next.minParticipants <= bracket.maxParticipants
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["priceBrackets"],
            message: "Les paliers ne peuvent pas se chevaucher.",
          });
        }
      });
    }
  }
});

export type PlanFormInput = z.input<typeof basePlanFormSchema>;
