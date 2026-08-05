import { z } from "zod";

/**
 * E2-T02 — édition profil. Bio limit mirrors the onboarding step (E1-T05)
 * and the wireframe's "150 mots max" rule (~750 caractères).
 *
 * `country`/`sectors` (E8-T11, 5 août 2026) — référentiels admin-éditables
 * désormais (lib/referentials-query.ts), validés en chaîne(s) non vide(s)
 * plutôt qu'en enum figé sur lib/countries.ts/lib/sectors.ts.
 */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  title: z.string().trim().max(120).optional().default(""),
  bio: z
    .string()
    .trim()
    .max(750, "La bio ne doit pas dépasser 150 mots environ (750 caractères).")
    .optional()
    .default(""),
  linkedinUrl: z
    .string()
    .trim()
    .url("URL invalide")
    .refine(
      (url) => /^https?:\/\/([\w-]+\.)?linkedin\.com\//i.test(url),
      "Doit être une URL LinkedIn"
    )
    .optional()
    .or(z.literal(""))
    .default(""),
  country: z.string().trim().optional().or(z.literal("")).default(""),
  sectors: z.array(z.string().trim().min(1)).default([]),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// Écran 03 (US-005) — "Formats acceptés : JPG, PNG, WEBP · Taille max : 5 Mo"
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_SIZE_PX = 400;
