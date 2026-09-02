"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { companyAccountSchema } from "@/lib/validations/company-account";
import { validateSectorAndCountry } from "@/app/actions/company";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { BCRYPT_ROUNDS } from "@/lib/password";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const RATE_LIMITED_ERROR = "Trop de tentatives depuis cette adresse. Réessayez plus tard.";

/**
 * Checkout hybride Evolia (conception/07/09, 3 septembre 2026) — remplace
 * l'ancien `signup()` (retiré le 12 août, `mvp-connect-simple`) : ni lui
 * (compte seul, sans entreprise) ni l'ancienne Phase 2bis (compte +
 * entreprise, mais offre choisie après) ne correspondent au parcours validé
 * avec Evolia — offre choisie d'abord, inscription du gestionnaire et
 * entreprise ensemble, tout dans le même checkout (voir BACKLOG_MVP.md §3).
 *
 * Crée compte + entreprise + abonnement (`PENDING_PAYMENT`) en une seule
 * transaction. Volontairement minimal : la fiche entreprise complète
 * (description, logo, coordonnées) et l'ajout des collaborateurs restent
 * pour après paiement, sur des écrans déjà existants (`company-form.tsx`,
 * l'onglet Gestion de `/entreprises/[id]`).
 */
export async function createCompanyAccount(input: unknown): Promise<ActionResult> {
  // Même anti-abus que l'ancien signup() — rien n'empêche sinon de créer
  // des comptes/entreprises en boucle, aucune vérification d'email requise
  // dans ce parcours self-service.
  const rateLimit = await checkRateLimit(`signup:${getClientIp()}`, 5, 60 * 60);
  if (!rateLimit.allowed) {
    return { success: false, error: RATE_LIMITED_ERROR };
  }

  const parsed = companyAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  const normalizedEmail = f.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return {
      success: false,
      error: "Un compte existe déjà avec cet email. Connectez-vous plutôt.",
    };
  }

  const plan = await prisma.plan.findFirst({
    where: { id: f.planId, isActive: true, isSelfService: true },
  });
  if (!plan) {
    return { success: false, error: "Offre invalide ou plus disponible." };
  }

  const referentialError = await validateSectorAndCountry(f.sector, f.country);
  if (referentialError) return { success: false, error: referentialError };

  const passwordHash = await bcrypt.hash(f.password, BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: f.name, email: normalizedEmail, passwordHash, status: "ACTIVE" },
    });
    const company = await tx.company.create({
      data: {
        name: f.companyName,
        sector: f.sector,
        country: f.country,
        companyAdminId: user.id,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { companyId: company.id } });
    await tx.companySubscription.create({
      data: { companyId: company.id, planId: plan.id, status: "PENDING_PAYMENT" },
    });
  });

  return { success: true, data: undefined };
}
