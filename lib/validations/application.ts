import { z } from "zod";

import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";

/**
 * B1 (audit sécurité/conformité du 29 juillet 2026) — /demande-acces
 * n'existait pas alors que login-form.tsx y renvoie : c'est le seul canal
 * d'acquisition de nouveaux membres. Champs alignés sur
 * wireframe/demande-acces.html (déjà validé) — voir aussi
 * conception/01_onboarding_acces.md UC-01/02.
 */
export const applicationSchema = z.object({
  fullName: z.string().trim().min(1, "Le nom complet est requis").max(120),
  email: z.string().trim().min(1, "L'email est requis").email("Adresse email invalide"),
  companyName: z.string().trim().min(1, "L'entreprise est requise").max(160),
  title: z.string().trim().min(1, "La fonction est requise").max(120),
  sector: z.enum(SECTORS, { errorMap: () => ({ message: "Secteur invalide" }) }),
  country: z.enum(COUNTRIES, { errorMap: () => ({ message: "Pays invalide" }) }),
  requestedTier: z.enum(["MEMBER", "EXECUTIVE", "CHAIRMAN"]),
  sponsorName: z.string().trim().max(120).optional(),
  motivation: z
    .string()
    .trim()
    .min(30, "Décrivez votre motivation en quelques phrases (30 caractères minimum)")
    .max(2000),
  consent: z.literal(true, {
    errorMap: () => ({
      message:
        "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.",
    }),
  }),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
