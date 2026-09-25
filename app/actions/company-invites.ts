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
import { withEventRegistrationLock } from "@/lib/event-registration-lock";
import { BCRYPT_ROUNDS } from "@/lib/password";
import { formatDateFr } from "@/lib/utils";
import CompanyInviteEmail from "@/emails/company-invite-email";
import CompanyCollaboratorWelcomeEmail from "@/emails/company-collaborator-welcome-email";
import EventRegistrationEmail from "@/emails/event-registration-email";

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

type SubscriptionForEvent = {
  status: Parameters<typeof computeEffectiveStatus>[0];
  plan: { id: string; eventId: string | null; event?: { date: Date } | null };
};

/** Évènement de l'offre si l'abonnement est `ACTIVE` (statut effectif, RG-12), sinon `null`. */
function activeEventOf(subscription: SubscriptionForEvent | null | undefined) {
  if (!subscription) return null;
  const effectiveStatus = computeEffectiveStatus(
    subscription.status,
    subscription.plan.event?.date
  );
  if (effectiveStatus !== "ACTIVE" || !subscription.plan.eventId) return null;
  return { eventId: subscription.plan.eventId, planId: subscription.plan.id };
}

/**
 * Inscription d'un membre de l'entreprise à l'évènement de son offre —
 * mécanique RG-14 d'`acceptCompanyInvite` (verrou + capacité, voir plus
 * bas), partagée depuis le 25 septembre 2026 avec `setAdminParticipates`.
 * `null` si l'évènement est complet (ou introuvable). `wasConfirmed` :
 * l'inscription était déjà confirmée avant l'appel (aucun email à renvoyer).
 */
async function registerCompanyMemberToEvent(userId: string, eventId: string, planId: string) {
  return withEventRegistrationLock(eventId, async () => {
    const existingRegistration = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    const [event, takenSpots] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.eventRegistration.count({
        where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
      }),
    ]);
    // Une inscription annulée ne réserve plus de place : comme une
    // nouvelle, elle doit tenir dans la capacité restante.
    const holdsSpot = existingRegistration != null && existingRegistration.status !== "CANCELLED";
    const hasRoom = holdsSpot || !event || takenSpots < event.capacity;
    if (!hasRoom || !event) return null;

    const registration = await prisma.eventRegistration.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status: "CONFIRMED", paymentStatus: "PAID", planId },
      create: { eventId, userId, status: "CONFIRMED", paymentStatus: "PAID", planId },
    });
    return {
      registration,
      event,
      wasConfirmed: existingRegistration?.status === "CONFIRMED",
    };
  });
}

async function sendEventRegistrationEmail(
  user: { email: string; name: string },
  event: { title: string; date: Date; isOnline: boolean; location: string },
  logPrefix: string
) {
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: `Inscription confirmée — ${event.title}`,
      react: EventRegistrationEmail({
        memberName: user.name,
        eventTitle: event.title,
        eventDateLabel: formatDateFr(event.date),
        eventLocation: event.isOnline ? "En ligne" : event.location,
        requiresManualValidation: false,
      }),
    });
  } catch (err) {
    console.error(`[${logPrefix}] failed to send event registration email`, err);
  }
}

/**
 * 22 septembre 2026 (`conception/12` §3.3) — case « Je participe » : bascule
 * si le gestionnaire lui-même consomme une place de l'offre. Ne bloque
 * jamais sur le plafond en l'activant — un gestionnaire qui se déclare
 * participant après coup, une fois le plafond atteint par ailleurs, doit
 * pouvoir le faire (c'est à lui de retirer un collaborateur si besoin,
 * pas à cette action de le faire à sa place).
 *
 * Audit (25 septembre 2026) — la case ne changeait que le décompte des
 * places : un gestionnaire qui la cochait après la validation du paiement
 * n'était jamais inscrit à l'évènement, et celui qui la décochait restait
 * inscrit. Une fois l'abonnement `ACTIVE` et lié à un évènement, elle
 * pilote aussi son `EventRegistration` : cocher l'inscrit (même mécanique
 * qu'`acceptCompanyInvite`, capacité de l'évènement vérifiée — toujours pas
 * le plafond de l'offre), décocher annule son inscription (comme
 * `cancelEventRegistration` : statut `CANCELLED`, jamais une inscription
 * déjà enregistrée sur place).
 */
export async function setAdminParticipates(
  companyId: string,
  participates: boolean
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: { include: { plan: { include: { event: true } } } } },
  });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut modifier ce choix." };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { adminParticipates: participates },
  });

  let warning: string | undefined;
  const activeEvent = activeEventOf(company.subscription);
  if (activeEvent) {
    if (participates) {
      const outcome = await registerCompanyMemberToEvent(
        viewer.id,
        activeEvent.eventId,
        activeEvent.planId
      );
      if (!outcome) {
        warning =
          "Votre choix est enregistré, mais l'évènement est complet : vous n'avez pas pu y être inscrit(e). Contactez l'équipe CEO Summit.";
      } else if (!outcome.wasConfirmed) {
        await sendEventRegistrationEmail(viewer, outcome.event, "setAdminParticipates");
      }
    } else {
      await prisma.eventRegistration.updateMany({
        where: {
          eventId: activeEvent.eventId,
          userId: viewer.id,
          status: { not: "CANCELLED" },
          checkedIn: false,
        },
        data: { status: "CANCELLED" },
      });
    }
  }

  revalidatePath(`/entreprises/${companyId}`);
  return { success: true, data: undefined, ...(warning ? { warning } : {}) };
}

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
   * Correctif (7 août 2026, audit) — statut effectif (`computeEffectiveStatus`,
   * RG-12) plutôt que le statut brut en base, et inscription sérialisée par
   * `withEventRegistrationLock` avec vérification de capacité (voir
   * `registerCompanyMemberToEvent`) ; si l'évènement est complet,
   * l'invitation est tout de même acceptée (l'entreprise a payé pour ce
   * collaborateur) mais celui-ci n'est pas inscrit — cas limite qui
   * nécessitera un suivi manuel admin, préférable à un dépassement
   * silencieux de capacité.
   *
   * Correctif (7 août 2026) — email de confirmation d'inscription envoyé
   * hors du verrou, sans bloquer l'acceptation en cas d'échec d'envoi.
   */
  const activeEvent = activeEventOf(subscription);
  if (activeEvent) {
    const outcome = await registerCompanyMemberToEvent(
      newUser.id,
      activeEvent.eventId,
      activeEvent.planId
    );
    if (outcome) {
      await sendEventRegistrationEmail(newUser, outcome.event, "acceptCompanyInvite");
    }
  }

  return { success: true, data: { email: invite.email } };
}
