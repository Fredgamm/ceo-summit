import { z } from "zod";

import { jobTitleSchema } from "@/lib/validations/company";

import { passwordSchema, emailSchema } from "@/lib/validations/auth";

/**
 * Checkout hybride Evolia (conception/07/09, 3 septembre 2026) — inscription
 * du gestionnaire + entreprise, volontairement minimale pour faciliter la
 * création de compte et la validation côté Evolia : le reste de la fiche
 * entreprise (description, logo, coordonnées, réseaux sociaux) et l'ajout
 * des collaborateurs sont explicitement différés à après paiement (voir
 * BACKLOG_MVP.md §3) — pas dans ce schéma.
 */
export const companyAccountSchema = z
  .object({
    planId: z.string().min(1, "Choisissez une offre."),
    name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
    title: jobTitleSchema,
    email: emailSchema,
    /**
     * 5 nov. 2026 — téléphone obligatoire dès l'inscription, au format
     * international « +261 34 12 345 67 » (indicatif choisi dans la liste).
     */
    phone: z
      .string({ required_error: "Le téléphone est requis" })
      .trim()
      .min(1, "Le téléphone est requis")
      .max(30, "Numéro de téléphone trop long")
      .regex(/^\+\d{1,4} [\d\s()-]+$/, "Numéro de téléphone invalide")
      .refine((value) => value.replace(/\D/g, "").length >= 8, "Numéro de téléphone trop court"),
    password: passwordSchema,
    confirmPassword: z.string(),
    companyName: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
    sector: z.string().trim().min(1, "Le secteur est requis"),
    country: z.string().trim().min(1, "Le pays est requis"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export type CompanyAccountInput = z.input<typeof companyAccountSchema>;
