import { z } from "zod";

import { optionalUrlField } from "@/lib/validations/profile";

/**
 * Parcours revu (1er août 2026) — coordonnées, réseaux sociaux et logo
 * ajoutés au formulaire d'entreprise. Réseaux sociaux limités à 3 plateformes
 * concrètes (LinkedIn/Facebook/Instagram) plutôt qu'une liste ouverte —
 * couvre l'usage réel sans complexifier le formulaire ; stockés en JSON
 * (Company.socialLinks) pour ne pas figer le schéma si une 4e s'ajoute.
 *
 * `sector`/`country` (E8-T11, 5 août 2026) — voir la même note dans
 * lib/validations/application.ts : référentiels admin-éditables désormais,
 * validés en chaîne non vide plutôt qu'en enum figé.
 */
export const companyFormSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  sector: z.string().trim().min(1, "Le secteur est requis"),
  country: z.string().trim().min(1, "Le pays est requis"),
  description: z.string().trim().max(1000).optional().default(""),
  /**
   * Audit sécurité (25 septembre 2026) — `website` et les trois réseaux
   * sociaux étaient des chaînes libres rendues en `href` (app/entreprises/
   * [id]/page.tsx, app/membres/[id]/page.tsx) : un `javascript:...` saisi
   * ici s'exécutait au clic de n'importe quel visiteur. Même champ que le
   * profil membre (normalisation "https://" + http(s) uniquement).
   */
  website: optionalUrlField(undefined, undefined, 200),
  logoUrl: z.string().trim().max(500).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  linkedinUrl: optionalUrlField(undefined, undefined, 300),
  facebookUrl: optionalUrlField(undefined, undefined, 300),
  instagramUrl: optionalUrlField(undefined, undefined, 300),
  additionalInfo: z.string().trim().max(1000).optional().default(""),
});

export type CompanyFormInput = z.input<typeof companyFormSchema>;

export const inviteTeammateSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  email: z.string().trim().min(1, "L'email est requis").email("Adresse email invalide"),
});
