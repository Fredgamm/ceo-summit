import { z } from "zod";

import { normalizeUrl } from "@/lib/normalize-url";

/**
 * Champ URL optionnel — préfixe automatiquement "https://" si l'utilisateur
 * n'a saisi qu'un domaine nu ("linkedin.com/in/x", "monsite.mg") avant de
 * valider, plutôt que de rejeter une saisie qui n'a juste pas de schéma
 * explicite (audit QA du 22 septembre 2026). `hostPattern`/`hostMessage`
 * restreignent en plus le domaine accepté (ex. LinkedIn uniquement).
 */
function optionalUrlField(hostPattern?: RegExp, hostMessage?: string) {
  return z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (raw === "") return "";
      const normalized = normalizeUrl(raw);
      if (!z.string().url().safeParse(normalized).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL invalide" });
        return z.NEVER;
      }
      if (hostPattern && !hostPattern.test(normalized)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: hostMessage ?? "URL invalide" });
        return z.NEVER;
      }
      return normalized;
    })
    .default("");
}

/**
 * E2-T02 — édition profil. Bio limit mirrors the onboarding step (E1-T05)
 * and the wireframe's "150 mots max" rule (~750 caractères).
 *
 * `country`/`sectors` (E8-T11, 5 août 2026) — référentiels admin-éditables
 * désormais (lib/referentials-query.ts), validés en chaîne(s) non vide(s)
 * plutôt qu'en enum figé sur lib/countries.ts/lib/sectors.ts.
 *
 * `title` obligatoire (audit QA du 22 septembre 2026) — acceptait jusqu'ici
 * une chaîne vide malgré l'astérisque affiché sur le formulaire.
 */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  title: z.string().trim().min(1, "Le titre / poste est requis").max(120),
  bio: z
    .string()
    .trim()
    .max(750, "La bio ne doit pas dépasser 150 mots environ (750 caractères).")
    .optional()
    .default(""),
  websiteUrl: optionalUrlField(),
  linkedinUrl: optionalUrlField(
    /^https?:\/\/([\w-]+\.)?linkedin\.com\//i,
    "Doit être une URL LinkedIn"
  ),
  country: z.string().trim().optional().or(z.literal("")).default(""),
  sectors: z.array(z.string().trim().min(1)).default([]),
  /**
   * Gestion corporate (7 août 2026) — jusqu'ici jamais collecté nulle part
   * dans l'app malgré le champ `User.phone` existant depuis le début du
   * schéma ; nécessaire pour notifier par SMS (Befiana) l'admin entreprise
   * qui soumet un achat groupé. Format libre, pas de validation stricte de
   * préfixe pays — les numéros locaux et internationaux doivent tous deux
   * passer.
   */
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[\d\s+()-]*$/, "Numéro de téléphone invalide")
    .optional()
    .or(z.literal(""))
    .default(""),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// Écran 03 (US-005) — "Formats acceptés : JPG, PNG, WEBP · Taille max : 5 Mo"
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_SIZE_PX = 400;
