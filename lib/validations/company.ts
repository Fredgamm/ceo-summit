import { z } from "zod";

import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";

/** Phase 2 offres/paiement (30 juillet 2026) — création de fiche entreprise. */
export const companyFormSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  sector: z.enum(SECTORS, { errorMap: () => ({ message: "Secteur invalide" }) }),
  country: z.enum(COUNTRIES, { errorMap: () => ({ message: "Pays invalide" }) }),
  description: z.string().trim().max(1000).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
});

export type CompanyFormInput = z.input<typeof companyFormSchema>;

export const inviteTeammateSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  email: z.string().trim().min(1, "L'email est requis").email("Adresse email invalide"),
});
