"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateSecureToken, COMPANY_INVITE_TTL_MS } from "@/lib/tokens";
import { seatCap } from "@/lib/company-seats";
import { sendTransactionalEmail } from "@/lib/resend";
import { inviteTeammateSchema } from "@/lib/validations/company";
import { setPasswordSchema } from "@/lib/validations/auth";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import { withEventRegistrationLock } from "@/lib/event-registration-lock";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { formatDateFr } from "@/lib/utils";
import CompanyInviteEmail from "@/emails/company-invite-email";
import CompanyCollaboratorWelcomeEmail from "@/emails/company-collaborator-welcome-email";
import EventRegistrationEmail from "@/emails/event-registration-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * 22 septembre 2026 (`conception/12` §3.3) — case « Je participe » : bascule
 * si le gestionnaire lui-même consomme une place de l'offre. Ne bloque
 * jamais sur le plafond en l'activant — un gestionnaire qui se déclare
 * participant après coup, une fois le plafond atteint par ailleurs, doit
 * pouvoir le faire (c'est à lui de retirer un collaborateur si besoin,
 * pas à cette action de le faire à sa place).
 */
export async function setAdminParticipates(
  companyId: string,
  participates: boolean
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut modifier ce choix." };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { adminParticipates: participates },
  });

  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined };
}

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
    include: { subscription: { include: { plan: true } } },
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

  const applicableCap = company.subscription ? seatCap(company.subscription) : null;
  if (applicableCap != null) {
    const [memberCount, pendingInviteCount] = await Promise.all([
      // 22 septembre 2026 (`conception/12` §3.3) — le gestionnaire ne
      // consomme une place que s'il a coché « Je participe » ; ce n'est
      // sinon qu'un compte admin, pas un participant à l'évènement.
      prisma.user.count({
        where: {
          companyId,
          ...(company.adminParticipates ? {} : { id: { not: company.companyAdminId } }),
        },
      }),
      // Une invitation expirée jamais acceptée ne doit plus occuper de siège.
      prisma.companyInvite.count({
        where: { companyId, status: "PENDING", expiresAt: { gt: new Date() } },
      }),
    ]);
    if (memberCount + pendingInviteCount >= applicableCap) {
      return {
        success: false,
        error: `Plafond de ${applicableCap} participant(s) atteint pour l'offre actuelle. Pour ajouter d'autres participants, veuillez choisir une offre ci-dessous.`,
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
      invitedById: session.user.id,
      token,
      expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS),
    },
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
 * 22 septembre 2026 — jusqu'ici, un email d'invitation perdu (spam, adresse
 * corrigée après coup...) obligeait à révoquer puis réinviter, puisque
 * `inviteTeammate` refuse une deuxième invitation en attente pour le même
 * email. Régénère le token et l'expiration de l'invitation existante et
 * renvoie le même email, sans passer par cette étape.
 */
export async function resendInvite(inviteId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const invite = await prisma.companyInvite.findUnique({
    where: { id: inviteId },
    include: { company: true },
  });
  if (!invite) return { success: false, error: "Invitation introuvable." };
  if (invite.company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut renvoyer une invitation." };
  }
  if (invite.status !== "PENDING") {
    return { success: false, error: "Cette invitation n'est plus en attente." };
  }

  const token = generateSecureToken();
  await prisma.companyInvite.update({
    where: { id: inviteId },
    data: { token, expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS) },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/invitation/${token}`;
  try {
    await sendTransactionalEmail({
      to: invite.email,
      subject: `${invite.company.name} vous invite à rejoindre CEO Summit`,
      react: CompanyInviteEmail({
        inviteeName: invite.name,
        companyName: invite.company.name,
        inviteUrl,
      }),
    });
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
    include: { company: { select: { name: true } } },
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
    return {
      success: false,
      error:
        "Un compte existe déjà avec cet email — connectez-vous puis contactez l'admin de l'entreprise pour être rattaché.",
    };
  }

  const passwordHash = await bcrypt.hash(parsedPassword.data.password, BCRYPT_ROUNDS);

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
   * 22 septembre 2026 (audit des emails transactionnels) — envoyé
   * systématiquement, contrairement à EventRegistrationEmail plus bas qui ne
   * s'envoie que si l'abonnement est ACTIVE et lié à un évènement avec de la
   * place : sans ça, un collaborateur dont l'entreprise est encore en
   * attente de validation (ou dont l'offre n'est pas liée à un évènement)
   * n'avait aucune confirmation que son compte était créé et actif.
   */
  try {
    await sendTransactionalEmail({
      to: newUser.email,
      subject: `Bienvenue sur CEO Summit — ${invite.company.name}`,
      react: CompanyCollaboratorWelcomeEmail({
        memberName: newUser.name,
        companyName: invite.company.name,
        loginUrl: `${process.env.NEXTAUTH_URL}/login`,
      }),
    });
  } catch (err) {
    console.error("[acceptCompanyInvite] failed to send welcome email", err);
  }

  /**
   * RG-14 (4 août 2026) — un collaborateur invité APRÈS la confirmation du
   * paiement de l'entreprise (le cas nominal de la décision "payer avant de
   * rassembler les collaborateurs") n'était jamais inscrit à l'évènement :
   * confirmCompanyPayment ne couvre que les membres déjà présents au
   * moment de la confirmation. On rattrape ici, à l'acceptation — mais
   * seulement si l'abonnement est encore ACTIVE (pas EXPIRED : inscrire
   * quelqu'un à une édition déjà passée n'a pas de sens).
   *
   * Correctif (7 août 2026, audit) — deux trous corrigés ensemble :
   * (1) le statut lu ici était le statut brut en base, jamais rafraîchi
   * sans qu'un admin entreprise revisite `selectPlan` — une souscription
   * restée `ACTIVE` par oubli après la date de l'évènement (RG-12)
   * inscrivait silencieusement le nouveau collaborateur à une édition déjà
   * passée. Utilise désormais `computeEffectiveStatus`, comme
   * `selectPlan`. (2) aucune vérification de capacité ni verrou n'existait
   * ici, contrairement à `registerForEvent` — un collaborateur pouvait
   * pousser un évènement au-delà de sa capacité. Sérialisé par
   * `withEventRegistrationLock`, capacité vérifiée avant inscription ; si
   * l'évènement est complet, l'invitation est tout de même acceptée
   * (l'entreprise a payé pour ce collaborateur) mais celui-ci n'est pas
   * inscrit à l'évènement — cas limite qui nécessitera un suivi manuel
   * admin, préférable à un dépassement silencieux de capacité.
   *
   * Correctif (7 août 2026) — l'inscription était créée silencieusement :
   * aucun email n'informait jamais le collaborateur qu'il était inscrit,
   * ni ne lui transmettait son badge/QR (contrairement à `registerForEvent`,
   * qui envoie systématiquement `EventRegistrationEmail`). Même envoi ici,
   * en dehors du verrou (l'email n'a pas besoin de tenir le verrou de
   * capacité) et sans bloquer l'acceptation de l'invitation en cas
   * d'échec d'envoi (même principe que partout ailleurs dans ce fichier).
   */
  const subscription = await prisma.companySubscription.findUnique({
    where: { companyId: invite.companyId },
    include: { plan: { include: { event: { select: { date: true } } } } },
  });
  const effectiveStatus = subscription
    ? computeEffectiveStatus(subscription.status, subscription.plan.event?.date)
    : null;
  if (effectiveStatus === "ACTIVE" && subscription!.plan.eventId) {
    const eventId = subscription!.plan.eventId;
    const planId = subscription!.plan.id;
    const outcome = await withEventRegistrationLock(eventId, async () => {
      const existingRegistration = await prisma.eventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId: newUser.id } },
      });
      const [event, takenSpots] = await Promise.all([
        prisma.event.findUnique({ where: { id: eventId } }),
        prisma.eventRegistration.count({
          where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
        }),
      ]);
      const hasRoom = existingRegistration || !event || takenSpots < event.capacity;
      if (!hasRoom || !event) return null;

      const registration = await prisma.eventRegistration.upsert({
        where: { eventId_userId: { eventId, userId: newUser.id } },
        update: { status: "CONFIRMED", paymentStatus: "PAID", planId },
        create: { eventId, userId: newUser.id, status: "CONFIRMED", paymentStatus: "PAID", planId },
      });
      return { registration, event };
    });

    if (outcome) {
      try {
        await sendTransactionalEmail({
          to: newUser.email,
          subject: `Inscription confirmée — ${outcome.event.title}`,
          react: EventRegistrationEmail({
            memberName: newUser.name,
            eventTitle: outcome.event.title,
            eventDateLabel: formatDateFr(outcome.event.date),
            eventLocation: outcome.event.isOnline ? "En ligne" : outcome.event.location,
            requiresManualValidation: false,
          }),
        });
      } catch (err) {
        console.error("[acceptCompanyInvite] failed to send event registration email", err);
      }
    }
  }

  return { success: true, data: { email: invite.email } };
}
