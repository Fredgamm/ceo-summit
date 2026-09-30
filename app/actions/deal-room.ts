"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { opportunityFormSchema } from "@/lib/validations/opportunity";
import { getOrCreateConversation } from "@/lib/conversations";
import { allowedVisibilities } from "@/lib/deal-room-query";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import { isKeyUnderPrefix } from "@/lib/r2";
import { requireViewer } from "@/lib/require-viewer";
import { sendTransactionalEmail } from "@/lib/resend";
import AdminOpportunityAlertEmail from "@/emails/admin-opportunity-alert-email";
import OpportunityContactRequestEmail from "@/emails/opportunity-contact-request-email";
import OpportunityContactAcceptedEmail from "@/emails/opportunity-contact-accepted-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

class ContactAlreadyHandledError extends Error {}

/**
 * Audit sécurité (25 septembre 2026) — `attachments` venait tel quel du
 * client (`z.array(z.string())`), sans vérifier que chaque clé provient
 * d'un upload réel de l'auteur : une clé d'un autre usage du bucket (preuve
 * de paiement d'une autre entreprise, pièce jointe de salle...) était
 * ensuite résolue en URL signée pour tout lecteur de l'opportunité (voir
 * app/deal-room/[id]/page.tsx). `/api/deal-room/attachment` préfixe
 * toujours ses clés par `deal-room/<uploaderId>/` — même modèle que
 * `proofFileKey` (app/actions/company-subscription.ts).
 */
function ownsAllAttachments(attachments: string[], userId: string): boolean {
  return attachments.every((key) => isKeyUnderPrefix(key, `deal-room/${userId}/`));
}

/** E6-T03 — publication (gratuite, statut pending_moderation → email admin). */
export async function publishOpportunity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsed = opportunityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  if (!ownsAllAttachments(f.attachments, viewer.id)) {
    return { success: false, error: "Pièce jointe invalide." };
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      authorId: viewer.id,
      title: f.title,
      type: f.type,
      sector: f.sector,
      country: f.country,
      description: f.description,
      budget: f.budget.trim() ? parseInt(f.budget, 10) : null,
      budgetEur: f.budgetEur.trim() ? parseInt(f.budgetEur, 10) : null,
      deadline: f.deadline.trim() ? new Date(f.deadline) : null,
      visibility: f.visibility,
      attachments: f.attachments,
      status: "PENDING_MODERATION",
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Nouvelle opportunité à modérer — ${opportunity.title}`,
        react: AdminOpportunityAlertEmail({
          authorName: viewer.name,
          opportunityTitle: opportunity.title,
        }),
      });
    } catch (err) {
      // L'opportunité est déjà créée à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer la publication (même bug
      // de classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[publishOpportunity] failed to send admin alert email", err);
    }
  }

  revalidatePath("/deal-room");
  return { success: true, data: { id: opportunity.id } };
}

/**
 * E6-T02/E6-T04 — "Prendre contact".
 *
 * Décision d'architecture (sept. 2026, conception/09) — le système de
 * crédits Deal Room est retiré du chemin actif (pas supprimé : le schéma et
 * `lib/credit-deduction-lock.ts`/`lib/deal-room-settings.ts` restent
 * intacts pour une réintégration future). Prendre contact est désormais
 * gratuit et illimité pour tout membre dont l'entreprise a une offre
 * active/validée — plus de verrou, plus de vérification de solde.
 */
export async function contactOpportunityAuthor(opportunityId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { author: { select: { email: true } } },
  });

  if (!opportunity || opportunity.status !== "PUBLISHED") {
    return { success: false, error: "Cette opportunité n'est pas disponible." };
  }
  if (opportunity.authorId === viewer.id) {
    return { success: false, error: "Vous ne pouvez pas contacter votre propre opportunité." };
  }
  /**
   * Correctif (7 août 2026, audit) — cette action ne vérifiait jamais le
   * tier du viewer face à `opportunity.visibility`, contrairement à la
   * page détail (`app/deal-room/[id]/page.tsx:62`, qui commente
   * explicitement "défense en profondeur — une URL directe ne doit pas
   * contourner le gate de tier") et à la requête de liste. Un membre
   * MEMBER en connaissant l'id pouvait donc contacter l'auteur d'une
   * opportunité réservée EXECUTIVE/CHAIRMAN et dépenser un crédit pour ça.
   */
  const viewerTier = getViewerTierFromCompany(viewer.company);
  if (!allowedVisibilities(viewerTier).includes(opportunity.visibility)) {
    return { success: false, error: "Cette opportunité n'est pas disponible." };
  }

  const existing = await prisma.opportunityContact.findUnique({
    where: { opportunityId_initiatorId: { opportunityId, initiatorId: viewer.id } },
  });
  if (existing) {
    return { success: false, error: "Vous avez déjà pris contact pour cette opportunité." };
  }

  await prisma.opportunityContact.create({
    data: {
      opportunityId,
      initiatorId: viewer.id,
      receiverId: opportunity.authorId,
      creditsSpent: 0,
    },
  });

  try {
    await sendTransactionalEmail({
      to: opportunity.author.email,
      subject: `Nouvelle demande de contact — ${opportunity.title}`,
      react: OpportunityContactRequestEmail({
        initiatorName: viewer.name,
        opportunityTitle: opportunity.title,
        opportunityUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/deal-room/${opportunityId}`,
      }),
    });
  } catch (err) {
    // Le contact est déjà créé à ce stade — un échec d'envoi de la
    // notification à l'auteur ne doit pas faire échouer l'action (même bug
    // de classe que celui corrigé sur signup() le 1er août 2026, et sur
    // publishOpportunity le 7 août).
    console.error("[contactOpportunityAuthor] failed to send notification email", err);
  }

  revalidatePath(`/deal-room/${opportunityId}`);
  return { success: true, data: undefined };
}

/**
 * E7-T04 — "À l'acceptation d'un contact Deal Room → création automatique
 * de la conversation." Only the receiver (opportunity author) may decide.
 */
export async function acceptOpportunityContact(
  contactId: string
): Promise<ActionResult<{ conversationId: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: {
      opportunity: { select: { id: true, title: true } },
      initiator: { select: { email: true, name: true } },
    },
  });
  if (!contact || contact.receiverId !== viewer.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  const conversation = await getOrCreateConversation(
    contact.initiatorId,
    contact.receiverId,
    contact.opportunityId
  );
  await prisma.opportunityContact.update({
    where: { id: contactId },
    data: { status: "ACCEPTED", conversationId: conversation.id },
  });

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — pendant du
   * OpportunityContactRequestEmail : sans ça, l'initiateur n'apprenait
   * l'acceptation qu'en revisitant la plateforme de lui-même.
   */
  try {
    await sendTransactionalEmail({
      to: contact.initiator.email,
      subject: `Demande de contact acceptée — ${contact.opportunity.title}`,
      react: OpportunityContactAcceptedEmail({
        receiverName: viewer.name,
        opportunityTitle: contact.opportunity.title,
        conversationUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/messagerie/${conversation.id}`,
      }),
    });
  } catch (err) {
    console.error("[acceptOpportunityContact] failed to send notification email", err);
  }

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: { conversationId: conversation.id } };
}

/**
 * Partagé entre declineOpportunityContact et withdrawOpportunityContact —
 * seule la vérification d'autorisation diffère à l'appel.
 *
 * Correctif (7 août 2026, audit) — la vérification `status !== "PENDING"`
 * se faisait chez l'appelant, sur une lecture antérieure à l'update, sans
 * condition sur l'update lui-même : deux appels concurrents (double-clic,
 * ou refus et retrait au même instant) passaient tous deux la vérification
 * obsolète. Le passage à `DECLINED` est désormais conditionné sur
 * `status: "PENDING"` — un second appel concurrent trouve 0 ligne mise à
 * jour et lève `ContactAlreadyHandledError`.
 *
 * Décision d'architecture (sept. 2026, conception/09) — le remboursement de
 * crédit qui vivait ici a disparu avec le système de crédits Deal Room
 * (retiré du chemin actif, pas supprimé) : prendre contact ne coûte plus
 * rien à rembourser.
 */
async function declineContact(contact: { id: string }): Promise<void> {
  const { count } = await prisma.opportunityContact.updateMany({
    where: { id: contact.id, status: "PENDING" },
    data: { status: "DECLINED" },
  });
  if (count === 0) {
    throw new ContactAlreadyHandledError();
  }
}

export async function declineOpportunityContact(contactId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: { opportunity: { select: { title: true } } },
  });
  if (!contact || contact.receiverId !== viewer.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  try {
    await declineContact(contact);
  } catch (err) {
    if (err instanceof ContactAlreadyHandledError) {
      return { success: false, error: "Cette demande a déjà été traitée." };
    }
    throw err;
  }

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: undefined };
}

/**
 * Sprint de correction (5 août 2026, EX-T01) — l'initiateur d'une demande de
 * contact restée sans réponse n'avait auparavant aucun moyen d'agir. Il peut
 * désormais retirer lui-même sa demande, ce qui la clôt — couvre le cas
 * "jamais répondu" sans nécessiter de tâche planifiée (aucune infra de cron
 * dans ce projet, voir BACKLOG_DEV.md).
 */
export async function withdrawOpportunityContact(contactId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const contact = await prisma.opportunityContact.findUnique({
    where: { id: contactId },
    include: { opportunity: { select: { title: true } } },
  });
  if (!contact || contact.initiatorId !== viewer.id) {
    return { success: false, error: "Demande introuvable." };
  }
  if (contact.status !== "PENDING") {
    return { success: false, error: "Cette demande a déjà été traitée." };
  }

  try {
    await declineContact(contact);
  } catch (err) {
    if (err instanceof ContactAlreadyHandledError) {
      return { success: false, error: "Cette demande a déjà été traitée." };
    }
    throw err;
  }

  revalidatePath(`/deal-room/${contact.opportunityId}`);
  return { success: true, data: undefined };
}

/**
 * Sprint de correction (5 août 2026, EX-T01) — une opportunité refusée ou
 * "modifications demandées" par la modération n'avait auparavant aucun
 * chemin de retour : l'auteur ne pouvait ni la corriger ni la resoumettre.
 * Repasse par la même validation que la publication initiale et revient en
 * `PENDING_MODERATION`, note de modération remise à zéro.
 */
export async function resubmitOpportunity(
  opportunityId: string,
  input: unknown
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity || opportunity.authorId !== viewer.id) {
    return { success: false, error: "Opportunité introuvable." };
  }
  if (opportunity.status !== "REFUSED" && opportunity.status !== "CHANGES_REQUESTED") {
    return {
      success: false,
      error: "Seule une opportunité refusée ou à modifier peut être resoumise.",
    };
  }

  const parsed = opportunityFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  if (!ownsAllAttachments(f.attachments, viewer.id)) {
    return { success: false, error: "Pièce jointe invalide." };
  }

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      title: f.title,
      type: f.type,
      sector: f.sector,
      country: f.country,
      description: f.description,
      budget: f.budget.trim() ? parseInt(f.budget, 10) : null,
      budgetEur: f.budgetEur.trim() ? parseInt(f.budgetEur, 10) : null,
      deadline: f.deadline.trim() ? new Date(f.deadline) : null,
      visibility: f.visibility,
      attachments: f.attachments,
      status: "PENDING_MODERATION",
      moderationNote: null,
      moderatedById: null,
      moderatedAt: null,
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Opportunité resoumise à modérer — ${f.title}`,
        react: AdminOpportunityAlertEmail({ authorName: viewer.name, opportunityTitle: f.title }),
      });
    } catch (err) {
      console.error("[resubmitOpportunity] failed to send admin alert email", err);
    }
  }

  revalidatePath(`/deal-room/${opportunityId}`);
  revalidatePath("/deal-room");
  return { success: true, data: undefined };
}
