import { z } from "zod";

import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";

/**
 * Parcours revu (1er août 2026) — coordonnées, réseaux sociaux et logo
 * ajoutés au formulaire d'entreprise. Réseaux sociaux limités à 3 plateformes
 * concrètes (LinkedIn/Facebook/Instagram) plutôt qu'une liste ouverte —
 * couvre l'usage réel sans complexifier le formulaire ; stockés en JSON
 * (Company.socialLinks) pour ne pas figer le schéma si une 4e s'ajoute.
 */
export const companyFormSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  sector: z.enum(SECTORS, { errorMap: () => ({ message: "Secteur invalide" }) }),
  country: z.enum(COUNTRIES, { errorMap: () => ({ message: "Pays invalide" }) }),
  description: z.string().trim().max(1000).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  logoUrl: z.string().trim().max(500).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  linkedinUrl: z.string().trim().max(300).optional().default(""),
  facebookUrl: z.string().trim().max(300).optional().default(""),
  instagramUrl: z.string().trim().max(300).optional().default(""),
  additionalInfo: z.string().trim().max(1000).optional().default(""),
});

export type CompanyFormInput = z.input<typeof companyFormSchema>;

export const inviteTeammateSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  email: z.string().trim().min(1, "L'email est requis").email("Adresse email invalide"),
});
