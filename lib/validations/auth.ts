import { z } from "zod";

/**
 * Shared password policy — enforced both client-side (instant feedback) and
 * server-side (never trust the client). Matches architecture doc bcrypt note
 * (rounds: 12) implicitly: strength lives in the policy, not the hash cost.
 */
export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre");

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const emailSchema = z.string().min(1, "L'email est requis").email("Adresse email invalide");

/**
 * Parcours revu (1er août 2026) — le mot de passe est choisi immédiatement à
 * l'inscription (connexion automatique juste après), pas via un lien
 * d'activation envoyé par email : ça évitait un vrai blocage constaté en
 * conditions réelles (compte créé en base puis plantage silencieux si
 * l'envoi d'email échoue, écran figé côté client sans jamais pouvoir se
 * connecter). `MembershipApplication`/le webhook Evolia gardent leur propre
 * mécanisme `ActivationToken` (compte créé par un tiers, pas par l'intéressé
 * lui-même) — ce n'est que l'inscription self-service qui change ici.
 */
export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });
