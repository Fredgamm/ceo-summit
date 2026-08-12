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
