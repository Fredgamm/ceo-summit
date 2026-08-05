"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/tokens";
import { sendTransactionalEmail } from "@/lib/resend";
import { inviteTeammateSchema } from "@/lib/validations/company";
import { setPasswordSchema } from "@/lib/validations/auth";
import { seatCap } from "@/lib/company-payment-amount";
import CompanyInviteEmail from "@/emails/company-invite-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — seul l'admin entreprise invite.
 * Le plafond de collaborateurs (Plan.maxTeamMembers) est appliqué dès
 * l'invitation, pas seulement au paiement (décision explicite du plan) —
 * mais seulement une fois qu'une offre est réellement choisie : avant ça, un
 * plafond n'a pas encore de sens (l'entreprise n'a pas encore de plan actif).
 */
export async function inviteTeammate(companyId: string, input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: { include: { plan: { include: { linkedPlatformPlan: true } } } } },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== session.user.id) {
    return {
      success: false,
      error: "Seul l'admin de l'entreprise peut inviter des collaborateurs.",
    };
  }

  const parsed = inviteTeammateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const email = parsed.data.email.toLowerCase();

  /**
   * Deux plafonds indépendants, le plus restrictif s'applique :
   * - RG-13 (split plateforme/évènement) : quota de collaborateurs de
   *   l'avantage plateforme (`maxTeamMembers`), vit sur l'offre plateforme
   *   liée, jamais sur l'offre d'évènement elle-même.
   * - Nombre de sièges de *cette édition* — `includedSeats` en
   *   `FIXED_BUNDLE`, ou `declaredParticipants` en `PER_PARTICIPANT` une
   *   fois une preuve soumise (proposition "payer avant de rassembler").
   */
  const subscribedPlan = company.subscription?.plan;
  const platformCap =
    subscribedPlan?.linkedPlatformPlan?.maxTeamMembers ?? subscribedPlan?.maxTeamMembers ?? null;
  const editionCap = subscribedPlan
    ? (seatCap(subscribedPlan) ?? company.subscription?.declaredParticipants ?? null)
    : null;
  const applicableCap = [platformCap, editionCap]
    .filter((c): c is number => c != null)
    .reduce((min, c) => (min == null ? c : Math.min(min, c)), null as number | null);

  if (applicableCap != null) {
    const [memberCount, pendingInviteCount] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.companyInvite.count({ where: { companyId, status: "PENDING" } }),
    ]);
    if (memberCount + pendingInviteCount >= applicableCap) {
      return {
        success: false,
        error: `Plafond de ${applicableCap} collaborateur(s) atteint pour l'offre actuelle.`,
      };
    }
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { success: false, error: "Un compte existe déjà avec cet email." };
  }
  const existingInvite = await prisma.companyInvite.findFirst({
    where: { companyId, email, status: "PENDING" },
  });
  if (existingInvite) {
    return { success: false, error: "Une invitation est déjà en attente pour cet email." };
  }

  const token = generateSecureToken();
  await prisma.companyInvite.create({
    data: { companyId, email, name: parsed.data.name, invitedById: session.user.id, token },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/invitation/${token}`;
  try {
    await sendTransactionalEmail({
      to: email,
      subject: `${company.name} vous invite à rejoindre CEO Summit`,
      react: CompanyInviteEmail({
        inviteeName: parsed.data.name,
        companyName: company.name,
        inviteUrl,
      }),
    });
  } catch (err) {
    // L'invitation existe déjà en base à ce stade — un échec d'envoi ne doit
    // pas faire échouer l'action (même bug de classe que celui corrigé sur
    // signup() le 1er août 2026 : une dépendance Resend synchrone et non
    // rattrapée bloquait un flux qui n'a pas besoin d'être bloquant).
    console.error("[inviteTeammate] failed to send invite email", err);
  }

  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const invite = await prisma.companyInvite.findUnique({
    where: { id: inviteId },
    include: { company: true },
  });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut révoquer une invitation." };
  }
  if (invite.status !== "PENDING") {
    return { success: false, error: "Cette invitation n'est plus en attente." };
  }

  await prisma.companyInvite.update({ where: { id: inviteId }, data: { status: "REVOKED" } });

  revalidatePath(`/entreprises/${invite.companyId}`);
  return { success: true, data: undefined };
}

/**
 * Parcours revu (1er août 2026) — accepter une invitation crée le compte
 * directement (mot de passe choisi sur cette même page), sans second email
 * d'activation : l'invité a déjà prouvé posséder cette adresse en suivant le
 * lien reçu par email pour l'invitation elle-même, un deuxième aller-retour
 * par email n'apporte rien de plus et ajoute une dépendance Resend inutile.
 * L'appelant (accept-invite-button.tsx) enchaîne avec un signIn() côté
 * client pour la connexion automatique.
 */
export async function acceptCompanyInvite(
  token: string,
  password: string,
  confirmPassword: string
): Promise<ActionResult<{ email: string }>> {
  const invite = await prisma.companyInvite.findUnique({ where: { token } });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.status === "REVOKED")
    return { success: false, error: "Cette invitation a été révoquée." };
  if (invite.status === "ACCEPTED") {
    return { success: false, error: "Cette invitation a déjà été acceptée." };
  }

  const parsedPassword = setPasswordSchema.safeParse({ password, confirmPassword });
  if (!parsedPassword.success) {
    return {
      success: false,
      error: parsedPassword.error.issues[0]?.message ?? "Mot de passe invalide",
    };
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existingUser) {
    return {
      success: false,
      error:
        "Un compte existe déjà avec cet email — connectez-vous puis contactez l'admin de l'entreprise pour être rattaché.",
    };
  }

  const passwordHash = await bcrypt.hash(parsedPassword.data.password, 12);

  const [newUser] = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: invite.name,
        email: invite.email,
        companyId: invite.companyId,
        passwordHash,
        status: "ACTIVE",
      },
    }),
    prisma.companyInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);

  /**
   * RG-14 (4 août 2026) — un collaborateur invité APRÈS la confirmation du
   * paiement de l'entreprise (le cas nominal de la décision "payer avant de
   * rassembler les collaborateurs") n'était jamais inscrit à l'évènement :
   * confirmCompanyPayment ne couvre que les membres déjà présents au
   * moment de la confirmation. On rattrape ici, à l'acceptation — mais
   * seulement si l'abonnement est encore ACTIVE (pas EXPIRED : inscrire
   * quelqu'un à une édition déjà passée n'a pas de sens).
   */
  const subscription = await prisma.companySubscription.findUnique({
    where: { companyId: invite.companyId },
    include: { plan: true },
  });
  if (subscription?.status === "ACTIVE" && subscription.plan.eventId) {
    await prisma.eventRegistration.upsert({
      where: {
        eventId_userId: { eventId: subscription.plan.eventId, userId: newUser.id },
      },
      update: { status: "CONFIRMED", paymentStatus: "PAID", planId: subscription.plan.id },
      create: {
        eventId: subscription.plan.eventId,
        userId: newUser.id,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        planId: subscription.plan.id,
      },
    });
  }

  return { success: true, data: { email: invite.email } };
}
