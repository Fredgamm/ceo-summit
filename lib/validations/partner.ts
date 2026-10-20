import { z } from "zod";

import { jobTitleSchema } from "@/lib/validations/company";

import { emailSchema, passwordSchema } from "@/lib/validations/auth";

/** Module 20 — invitation d'un gérant partenaire par l'admin : nom, e-mail et offre obligatoires. */
export const invitePartnerSchema = z.object({
  name: z.string().trim().min(2, "Le nom du gérant est requis").max(120),
  email: emailSchema,
  planId: z.string().min(1, "Choisissez une offre partenaire."),
  memberLimit: z.coerce
    .number()
    .int("Nombre de membres invalide")
    .min(1, "Au moins 1 membre")
    .max(500, "Nombre de membres trop élevé"),
  counterpart: z.string().trim().max(2000).optional().default(""),
});

/** Réglages modifiables ensuite sur la fiche admin de l'entreprise partenaire. */
export const partnerSettingsSchema = invitePartnerSchema.pick({
  memberLimit: true,
  counterpart: true,
});

/** Module 20 — inscription du gérant depuis le lien reçu par e-mail. */
export const acceptPartnerInviteSchema = z
  .object({
    title: jobTitleSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    companyName: z.string().trim().min(2, "Le nom de l'entreprise est requis").max(120),
    sector: z.string().trim().min(1, "Le secteur est requis"),
    country: z.string().trim().min(1, "Le pays est requis"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });
