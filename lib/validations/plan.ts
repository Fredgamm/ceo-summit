import { z } from "zod";

/**
 * Formulaire d'offre, simplifié après l'audit du 22 septembre
 * (`conception/12`). Une offre se décrit désormais avec trois choses et
 * rien d'autre : son identité (nom, slug, description), sa tarification
 * (mode + prix, et le seuil minimum si c'est une offre groupement), et son
 * nombre de places (`maxTeamMembers`).
 *
 * Retirés du formulaire à cette date, colonnes conservées en base :
 * - `includedSeats` — doublon de `maxTeamMembers`, fusionné dans celui-ci ;
 * - `includedCredits`/`hasUnlimitedCredits` — les crédits Deal Room ont été
 *   retirés du produit le 3 septembre (`conception/09` §4) ;
 * - `rank` — l'accès est identique pour tout membre payé depuis le
 *   3 septembre, ce champ ne compare plus rien (dérivé de `displayOrder`) ;
 * - `eventId`/`linkedPlatformPlanId` — plus de distinction offre
 *   plateforme / offre d'évènement pour ce MVP ; aucune offre active ne les
 *   renseignait.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const planFormSchema = z
  .object({
    name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(60),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, "Le slug doit contenir au moins 2 caractères")
      .max(80)
      .regex(SLUG_PATTERN, "Le slug ne peut contenir que des minuscules, chiffres et tirets"),
    description: z.string().trim().max(500).optional().default(""),
    /**
     * Mode explicite et obligatoire : une offre sans mode se facturait
     * auparavant à la personne sans que personne ne l'ait décidé
     * (`conception/12` §2.1).
     */
    pricingMode: z.enum(["FIXED_BUNDLE", "PER_PARTICIPANT"]).default("FIXED_BUNDLE"),
    priceAr: z.coerce.number().int().min(0, "Le prix ne peut pas être négatif"),
    /**
     * 3 septembre 2026 — prix officiel en euros ; `priceAr` est alors
     * recalculé côté serveur au taux du jour (jamais fait confiance à une
     * valeur envoyée par le client). Vide = offre cotée directement en Ariary.
     */
    priceEur: z.coerce
      .number()
      .int()
      .min(0, "Le prix ne peut pas être négatif")
      .optional()
      .nullable(),
    /** Offre groupement uniquement — effectif minimum pour y avoir droit. */
    minParticipants: z.coerce.number().int().min(1).optional().nullable(),
    /** Nombre de places incluses — sans objet pour une offre groupement. */
    maxTeamMembers: z.coerce.number().int().min(1).optional().nullable(),
    eligibilityNote: z.string().trim().max(500).optional().default(""),
    isActive: z.coerce.boolean().default(true),
    isSelfService: z.coerce.boolean().default(true),
    /** Achetable en quantité comme supplément d'un abonnement déjà actif (ex. Executive Pass). */
    isUpsell: z.coerce.boolean().default(false),
    displayOrder: z.coerce.number().int().default(0),
  })
  .superRefine((data, ctx) => {
    if (data.pricingMode === "FIXED_BUNDLE" && !data.maxTeamMembers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxTeamMembers"],
        message: "Le nombre de places incluses est requis pour un forfait fixe.",
      });
    }
    if (data.pricingMode === "PER_PARTICIPANT" && !data.minParticipants) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minParticipants"],
        message: "L'effectif minimum est requis pour une offre groupement.",
      });
    }
  });

export type PlanFormInput = z.input<typeof planFormSchema>;
