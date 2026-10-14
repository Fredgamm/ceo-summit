"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { companyAccountSchema } from "@/lib/validations/company-account";
import { validateSectorAndCountry } from "@/app/actions/company";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { sendEmailVerification } from "@/lib/email-verification";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const RATE_LIMITED_ERROR = "Trop de tentatives depuis cette adresse. Réessayez plus tard.";
const EXISTING_ACCOUNT_ERROR = "Un compte existe déjà avec cet email. Connectez-vous plutôt.";

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
  const rateLimit = await checkRateLimit(`signup:${await getClientIp()}`, 5, 60 * 60);
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
  if (existing) return { success: false, error: EXISTING_ACCOUNT_ERROR };

  const plan = await prisma.plan.findFirst({
    // Audit (25 septembre 2026) — une offre supplément (`isUpsell`) ne se
    // souscrit jamais seule, même règle que `selectPlan`.
    where: { id: f.planId, isActive: true, isSelfService: true, isUpsell: false },
  });
  if (!plan) {
    return { success: false, error: "Offre invalide ou plus disponible." };
  }

  const referentialError = await validateSectorAndCountry(f.sector, f.country);
  if (referentialError) return { success: false, error: referentialError };

  const passwordHash = await bcrypt.hash(f.password, BCRYPT_ROUNDS);

  // La vérification ci-dessus ne suffit pas pour deux envois simultanés (double
  // clic) : le second échoue sur l'unicité de l'email, à traduire en message
  // plutôt qu'en erreur 500.
  let createdUser: { id: string };
  try {
    createdUser = await prisma.$transaction(async (tx) => {
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
      return user;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: EXISTING_ACCOUNT_ERROR };
    }
    throw err;
  }

  /**
   * 14 oct. 2026 — d'abord la confirmation de l'adresse : le paiement n'est
   * possible qu'après (app/entreprise/paiement/page.tsx). L'e-mail de
   * bienvenue (« company-admin-welcome », prochaine étape : le paiement) part
   * une fois l'adresse confirmée (app/verifier-email/[token]/page.tsx). Un
   * échec d'envoi ne fait pas échouer l'inscription : l'écran de
   * confirmation propose de renvoyer le lien.
   */
  await sendEmailVerification({ id: createdUser.id, name: f.name, email: normalizedEmail });

  return { success: true, data: undefined };
}
