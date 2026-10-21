import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

// Toute tentative compte, mot de passe faux compris : freine un essai de mots de passe.
const RATE_LIMIT = 5;
const RATE_WINDOW_SEC = 15 * 60;

/**
 * 21 oct. 2026 — confirmation par mot de passe des réglages sensibles de
 * /admin/parametres (intégrations Evolia et Brevo : où partent les données
 * des membres, avec quelles clés). Limitée à 5 tentatives par quart d'heure
 * et par admin. Renvoie le message d'erreur à afficher, ou `null` si c'est
 * bon.
 */
export async function confirmAdminPassword(
  userId: string,
  scope: string,
  password: string
): Promise<string | null> {
  const rateLimit = await checkRateLimit(`admin:${scope}:${userId}`, RATE_LIMIT, RATE_WINDOW_SEC);
  if (!rateLimit.allowed) {
    return `Trop de tentatives. Réessayez dans ${Math.ceil(rateLimit.retryAfterSec / 60)} min.`;
  }
  if (!password) return "Confirmez avec votre mot de passe.";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return "Mot de passe incorrect.";
  }
  return null;
}
