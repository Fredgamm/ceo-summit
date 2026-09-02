import { z } from "zod";

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
    email: emailSchema,
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
