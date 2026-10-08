"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { generateSecureToken, COMPANY_INVITE_TTL_MS } from "@/lib/tokens";
import {
  seatCap,
  countUsedSeats,
  INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_MESSAGE,
} from "@/lib/company-seats";
import { sendTransactionalEmail } from "@/lib/resend";
import { inviteTeammateSchema } from "@/lib/validations/company";
import { setPasswordSchema } from "@/lib/validations/auth";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { resolveEmail } from "@/lib/email-template-resolver";
import { autoRegisterCompanyMembers } from "@/lib/event-auto-registration";

/**
 * `warning` (audit du 25 septembre 2026) — succès partiel à signaler à
 * l'utilisateur sans annuler l'action (ex. invitation créée mais email non
 * parti) : jusqu'ici, ces échecs étaient seulement loggués côté serveur et
 * le gestionnaire croyait l'email envoyé.
 */
type ActionResult<T = undefined> =
  { success: true; data: T; warning?: string } | { success: false; error: string };

const INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_ERROR = INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_MESSAGE;
const INVITE_EMAIL_FAILED_WARNING =
  "L'invitation est créée mais l'email n'a pas pu être envoyé — utilisez Renvoyer ou partagez le lien.";
const EXISTING_ACCOUNT_ERROR =
  "Un compte existe déjà avec cet email — connectez-vous puis contactez l'admin de l'entreprise pour être rattaché.";

class InviteAlreadyConsumedError extends Error {}

/**
 * Phase 2 offres/paiement (30 juillet 2026) — seul l'admin entreprise invite.
 * Le plafond de collaborateurs (`seatCap`) est appliqué dès l'invitation,
 * pas seulement à l'acceptation.
 *
 * Audit (25 septembre 2026) — n'est plus ouvert qu'une fois l'abonnement
 * `ACTIVE` (collaborateurs rassemblés après paiement, BACKLOG_MVP §3), et le
 * décompte des places passe par `countUsedSeats`, partagé avec
 * `resendInvite`, `acceptCompanyInvite` et la page Gestion.
 */
export async function inviteTeammate(companyId: string, input: unknown): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: { include: { plan: { include: { event: true } } } } },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== viewer.id) {
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

  const subscription = company.subscription;
  const effectiveStatus = subscription
    ? computeEffectiveStatus(subscription.status, subscription.plan.event?.date)
    : null;
  if (!subscription || effectiveStatus !== "ACTIVE") {
    return { success: false, error: INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_ERROR };
  }

  const applicableCap = seatCap(subscription);
  if (applicableCap != null) {
    const usedSeats = await countUsedSeats(company);
    if (usedSeats >= applicableCap) {
      return {
        success: false,
        error: `Plafond de ${applicableCap} participant(s) atteint pour l'offre actuelle. Pour ajouter d'autres participants, achetez des places supplémentaires depuis cet onglet Gestion, ou contactez l'équipe CEO Summit.`,
      };
    }
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { success: false, error: "Un compte existe déjà avec cet email." };
  }
  const existingInvite = await prisma.companyInvite.findFirst({
    where: { companyId, email, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    return { success: false, error: "Une invitation est déjà en attente pour cet email." };
  }

  const token = generateSecureToken();
  await prisma.companyInvite.create({
    data: {
      companyId,
      email,
      name: parsed.data.name,
      invitedById: viewer.id,
      token,
      expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS),
    },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/invitation/${token}`;
  let warning: string | undefined;
  try {
    const resolvedEmail = await resolveEmail("company-invite", {
      inviteeFirstName: parsed.data.name.split(" ")[0],
      companyName: company.name,
      inviteUrl,
    });
    if (resolvedEmail) await sendTransactionalEmail({ to: email, ...resolvedEmail });
  } catch (err) {
    // L'invitation existe déjà en base à ce stade — un échec d'envoi ne doit
    // pas faire échouer l'action (même bug de classe que celui corrigé sur
    // signup() le 1er août 2026). Audit (25 septembre 2026) — mais il est
    // désormais signalé : le gestionnaire croyait jusqu'ici l'email parti.
    console.error("[inviteTeammate] failed to send invite email", err);
    warning = INVITE_EMAIL_FAILED_WARNING;
  }

  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined, ...(warning ? { warning } : {}) };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const invite = await prisma.companyInvite.findUnique({
    where: { id: inviteId },
    include: { company: true },
  });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.company.companyAdminId !== viewer.id) {
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
 * 22 septembre 2026 — jusqu'ici, un email d'invitation perdu (spam, adresse
 * corrigée après coup...) obligeait à révoquer puis réinviter, puisque
 * `inviteTeammate` refuse une deuxième invitation en attente pour le même
 * email. Régénère le token et l'expiration de l'invitation existante et
 * renvoie le même email, sans passer par cette étape.
 *
 * Audit (25 septembre 2026) — mêmes conditions qu'`inviteTeammate`
 * (abonnement `ACTIVE`, plafond) : renvoyer une invitation expirée — qui ne
 * comptait donc plus — permettait de dépasser le nombre de places. Le
 * décompte se fait hors de cette invitation-ci, qui doit y tenir : pour une
 * invitation encore valide (déjà comptée), cela revient à n'échouer que si
 * l'entreprise est déjà au-delà du plafond.
 */
export async function resendInvite(inviteId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const invite = await prisma.companyInvite.findUnique({
    where: { id: inviteId },
    include: {
      company: { include: { subscription: { include: { plan: { include: { event: true } } } } } },
    },
  });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut renvoyer une invitation." };
  }
  if (invite.status !== "PENDING") {
    return { success: false, error: "Cette invitation n'est plus en attente." };
  }

  const subscription = invite.company.subscription;
  const effectiveStatus = subscription
    ? computeEffectiveStatus(subscription.status, subscription.plan.event?.date)
    : null;
  if (!subscription || effectiveStatus !== "ACTIVE") {
    return { success: false, error: INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_ERROR };
  }

  const applicableCap = seatCap(subscription);
  if (applicableCap != null) {
    const otherSeats = await countUsedSeats(invite.company, { excludeInviteId: invite.id });
    if (otherSeats >= applicableCap) {
      return {
        success: false,
        error: `Plafond de ${applicableCap} participant(s) atteint pour l'offre actuelle — cette invitation ne peut pas être renvoyée sans place disponible.`,
      };
    }
  }

  const token = generateSecureToken();
  await prisma.companyInvite.update({
    where: { id: inviteId },
    data: { token, expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS) },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/invitation/${token}`;
  try {
    const resolvedEmail = await resolveEmail("company-invite", {
      inviteeFirstName: invite.name.split(" ")[0],
      companyName: invite.company.name,
      inviteUrl,
    });
    if (resolvedEmail) await sendTransactionalEmail({ to: invite.email, ...resolvedEmail });
  } catch (err) {
    console.error("[resendInvite] failed to send invite email", err);
    return { success: false, error: "Échec de l'envoi de l'email. Réessayez plus tard." };
  }

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
  const invite = await prisma.companyInvite.findUnique({
    where: { token },
    include: {
      company: { select: { id: true, name: true, companyAdminId: true, adminParticipates: true } },
    },
  });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.status === "REVOKED")
    return { success: false, error: "Cette invitation a été révoquée." };
  if (invite.status === "ACCEPTED") {
    return { success: false, error: "Cette invitation a déjà été acceptée." };
  }
  if (invite.expiresAt < new Date()) {
    return {
      success: false,
      error:
        "Cette invitation a expiré — demandez à l'admin de l'entreprise de vous en renvoyer une.",
    };
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
    return { success: false, error: EXISTING_ACCOUNT_ERROR };
  }

  const subscription = await prisma.companySubscription.findUnique({
    where: { companyId: invite.companyId },
    include: { plan: { include: { event: { select: { date: true } } } } },
  });

  /**
   * Audit (25 septembre 2026) — même décompte que `inviteTeammate`
   * (`countUsedSeats`) : l'invitation acceptée occupe déjà sa place, mais
   * ne doit pas faire dépasser le plafond si celui-ci a baissé entre-temps
   * (changement d'offre, gestionnaire devenu participant).
   */
  const applicableCap = subscription ? seatCap(subscription) : null;
  if (applicableCap != null) {
    const otherSeats = await countUsedSeats(
      {
        id: invite.companyId,
        companyAdminId: invite.company.companyAdminId,
        adminParticipates: invite.company.adminParticipates,
      },
      { excludeInviteId: invite.id }
    );
    if (otherSeats >= applicableCap) {
      return {
        success: false,
        error:
          "Toutes les places de l'offre de votre entreprise sont déjà attribuées — contactez l'admin de l'entreprise.",
      };
    }
  }

  const passwordHash = await bcrypt.hash(parsedPassword.data.password, BCRYPT_ROUNDS);

  /**
   * Audit (25 septembre 2026) — deux acceptations concurrentes du même lien
   * (double clic, deux onglets) passaient toutes deux les vérifications
   * ci-dessus : l'invitation n'est désormais consommée que si elle est
   * encore `PENDING` (updateMany + count, dans la transaction), et la
   * contrainte d'unicité sur l'email renvoie un message au lieu d'une 500.
   */
  let newUser: { id: string; email: string; name: string };
  try {
    newUser = await prisma.$transaction(async (tx) => {
      const { count } = await tx.companyInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (count === 0) throw new InviteAlreadyConsumedError();
      return tx.user.create({
        data: {
          name: invite.name,
          email: invite.email,
          companyId: invite.companyId,
          passwordHash,
          status: "ACTIVE",
        },
      });
    });
  } catch (err) {
    if (err instanceof InviteAlreadyConsumedError) {
      return { success: false, error: "Cette invitation a déjà été acceptée." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: EXISTING_ACCOUNT_ERROR };
    }
    throw err;
  }

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — envoyé
   * systématiquement, contrairement à EventRegistrationEmail plus bas qui ne
   * s'envoie que si l'abonnement est ACTIVE et lié à un évènement avec de la
   * place : sans ça, un collaborateur dont l'entreprise est encore en
   * attente de validation (ou dont l'offre n'est pas liée à un évènement)
   * n'avait aucune confirmation que son compte était créé et actif.
   */
  try {
    const resolvedEmail = await resolveEmail("company-collaborator-welcome", {
      memberFirstName: newUser.name.split(" ")[0],
      companyName: invite.company.name,
      loginUrl: `${process.env.NEXTAUTH_URL}/login`,
    });
    if (resolvedEmail) await sendTransactionalEmail({ to: newUser.email, ...resolvedEmail });
  } catch (err) {
    console.error("[acceptCompanyInvite] failed to send welcome email", err);
  }

  // Module 21 §3.0 étape 3 (8 oct. 2026) — offre liée à un événement =
  // inscription : le nouveau collaborateur est inscrit s'il reste une place.
  await autoRegisterCompanyMembers(invite.companyId, "acceptCompanyInvite");

  return { success: true, data: { email: invite.email } };
}
