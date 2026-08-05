import { z } from "zod";

/**
 * B1 (audit sécurité/conformité du 29 juillet 2026) — /demande-acces
 * n'existait pas alors que login-form.tsx y renvoie : c'est le seul canal
 * d'acquisition de nouveaux membres. Champs alignés sur
 * wireframe/demande-acces.html (déjà validé) — voir aussi
 * conception/01_onboarding_acces.md UC-01/02.
 *
 * `sector`/`country` (E8-T11, 5 août 2026) — étaient des enums Zod figés
 * sur `lib/sectors.ts`/`lib/countries.ts` ; validés en chaîne non vide
 * depuis que ces deux champs sont des référentiels admin-éditables
 * (lib/referentials-query.ts), pas des listes connues à la compilation.
 */
export const applicationSchema = z.object({
  fullName: z.string().trim().min(1, "Le nom complet est requis").max(120),
  email: z.string().trim().min(1, "L'email est requis").email("Adresse email invalide"),
  companyName: z.string().trim().min(1, "L'entreprise est requise").max(160),
  title: z.string().trim().min(1, "La fonction est requise").max(120),
  sector: z.string().trim().min(1, "Le secteur est requis"),
  country: z.string().trim().min(1, "Le pays est requis"),
  requestedTier: z.enum(["MEMBER", "EXECUTIVE", "CHAIRMAN"]),
  consent: z.literal(true, {
    errorMap: () => ({
      message:
        "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.",
    }),
  }),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
