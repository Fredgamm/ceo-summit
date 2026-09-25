"use server";

import { prisma } from "@/lib/prisma";
import { applicationSchema, type ApplicationInput } from "@/lib/validations/application";
import { getReferentialLabels } from "@/lib/referentials-query";
import { sendTransactionalEmail } from "@/lib/resend";
import { resolveEmail } from "@/lib/email-template-resolver";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * B1 (audit du 29 juillet 2026) — seul point d'entrée public pour candidater.
 * Avant ce correctif, /demande-acces (référencé depuis login-form.tsx et
 * whitelisté dans middleware.ts) n'existait pas : le funnel d'acquisition
 * était totalement cassé.
 *
 * `consentedAt` horodate le consentement RGPD (case CGU/politique de
 * confidentialité cochée) — preuve de collecte, pas juste un booléen.
 */
export async function submitApplication(input: ApplicationInput): Promise<ActionResult> {
  // 25 septembre 2026 (audit MVP) — formulaire public sans compte : sans
  // limite, un script pouvait remplir la file des candidatures et faire
  // envoyer un email de confirmation Resend à n'importe quelle adresse.
  // Même pattern/limite que signup et mot de passe oublié.
  const rateLimit = await checkRateLimit(`apply:${getClientIp()}`, 5, 60 * 60);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: "Trop de tentatives depuis cette adresse. Réessayez plus tard.",
    };
  }

  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  // E8-T11 (5 août 2026) — `sector`/`country` sont des référentiels
  // admin-éditables (lib/referentials-query.ts), plus des enums figés à la
  // compilation : vérifiés ici contre la liste actuelle.
  const [validSectors, validCountries] = await Promise.all([
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);
  if (!validSectors.includes(parsed.data.sector)) {
    return { success: false, error: "Secteur invalide." };
  }
  if (!validCountries.includes(parsed.data.country)) {
    return { success: false, error: "Pays invalide." };
  }

  const email = parsed.data.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return {
      success: false,
      error: "Un compte existe déjà pour cet email. Connectez-vous plutôt.",
    };
  }

  const existingApplication = await prisma.membershipApplication.findFirst({
    where: { email, status: "PENDING" },
  });
  if (existingApplication) {
    return {
      success: false,
      error: "Une candidature est déjà en cours d'examen pour cet email.",
    };
  }

  await prisma.membershipApplication.create({
    data: {
      fullName: parsed.data.fullName,
      email,
      companyName: parsed.data.companyName,
      title: parsed.data.title,
      sector: parsed.data.sector,
      country: parsed.data.country,
      requestedTier: parsed.data.requestedTier,
      consentedAt: new Date(),
    },
  });

  try {
    const resolved = await resolveEmail("application-received", {
      candidateName: parsed.data.fullName,
    });
    if (resolved) await sendTransactionalEmail({ to: email, ...resolved });
  } catch (err) {
    // La candidature est déjà enregistrée à ce stade — un échec d'envoi ne
    // doit pas faire croire au candidat que sa soumission a échoué.
    console.error("[submitApplication] failed to send confirmation email", err);
  }

  return { success: true, data: undefined };
}
