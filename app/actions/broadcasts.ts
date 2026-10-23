"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { buildBroadcastRecipientsWhere, type SendableSegment } from "@/lib/broadcast-segments";
import { renderBroadcastBody } from "@/lib/broadcast-template";
import { requireAdmin } from "@/lib/admin-auth";
import { requireViewer } from "@/lib/require-viewer";
import { sendTransactionalEmail } from "@/lib/resend";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getSignedDownloadUrl, isKeyUnderPrefix } from "@/lib/r2";
import { BROADCAST_ATTACHMENT_LINK_TTL_SECONDS } from "@/lib/validations/broadcast";
import BroadcastEmail from "@/emails/broadcast-email";
import { render, toPlainText } from "@react-email/render";
import { getBrevoConfig, isBrevoReady, sendBrevoBatch } from "@/lib/brevo";
import { CEO_SUMMIT_CONTACT } from "@/lib/ceo-summit-contact";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * Sans Brevo, envois SMTP par petits paquets : 1000 connexions simultanées
 * à la boîte mail de ceo-summit.mg (hébergement mutualisé, envois limités)
 * se faisaient refuser ou classer en spam.
 */
const SMTP_CONCURRENCY = 5;

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

export interface BroadcastAttachmentInput {
  key: string;
  name: string;
}

const broadcastContentSchema = z.object({
  subject: z.string().trim().min(1, "L'objet est requis").max(200),
  body: z.string().trim().min(1, "Le corps du message est requis").max(20_000),
});
const broadcastSegmentSchema = z.enum(["ALL_ACTIVE", "CUSTOM"]);

function splitName(name: string): { prenom: string; nom: string } {
  const [prenom, ...rest] = name.trim().split(" ");
  return { prenom: prenom ?? name, nom: rest.join(" ") || "—" };
}

/**
 * Rapport QA du 1er oct. 2026 (§3.2a) — résout chaque clé R2 en lien signé
 * longue durée (le destinataire peut ouvrir l'email plusieurs jours après
 * l'envoi, contrairement à un usage "vu tout de suite"). Rejette toute clé
 * qui ne vient pas de la route d'upload dédiée, même provenance que les
 * autres uploads du projet (préfixe vérifié, pas de confiance aveugle dans
 * ce que le client envoie).
 */
async function resolveAttachmentLinks(
  attachments: BroadcastAttachmentInput[] | undefined
): Promise<{ name: string; url: string }[]> {
  if (!attachments || attachments.length === 0) return [];
  const bucket = process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents";
  const valid = attachments.filter((a) => isKeyUnderPrefix(a.key, "broadcasts/"));
  // Sans R2, getSignedDownloadUrl renvoie un chemin relatif (repli local,
  // lib/r2.ts) : inutilisable tel quel dans un client mail.
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return Promise.all(
    valid.map(async (a) => ({
      name: a.name,
      url: new URL(
        await getSignedDownloadUrl(bucket, a.key, BROADCAST_ATTACHMENT_LINK_TTL_SECONDS),
        appUrl
      ).toString(),
    }))
  );
}

/** E8-T09 — comptes réels par segment, affichés dans le composeur avant envoi. */
export async function getSegmentCounts(): Promise<ActionResult<{ ALL_ACTIVE: number }>> {
  await requireAdmin("communications");

  const allActive = await prisma.user.count({ where: buildBroadcastRecipientsWhere("ALL_ACTIVE") });
  return { success: true, data: { ALL_ACTIVE: allActive } };
}

export async function getCustomSegmentCount(
  country?: string,
  sector?: string,
  planIds?: string[]
): Promise<ActionResult<{ count: number }>> {
  await requireAdmin("communications");

  const count = await prisma.user.count({
    where: buildBroadcastRecipientsWhere("CUSTOM", { country, sector, planIds }),
  });
  return { success: true, data: { count } };
}

/** E8-T09 — "✉ Tester" : envoie uniquement à l'admin connecté, avec ses propres variables. */
export async function sendTestBroadcast(
  subject: string,
  body: string,
  attachments?: BroadcastAttachmentInput[]
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  await requireAdmin("communications");

  const parsedContent = broadcastContentSchema.safeParse({ subject, body });
  if (!parsedContent.success) {
    return { success: false, error: parsedContent.error.issues[0]?.message ?? "Champs invalides" };
  }
  ({ subject, body } = parsedContent.data);

  const { prenom, nom } = splitName(viewer.name);
  const renderedBody = renderBroadcastBody(body, {
    prenom,
    nom,
    entreprise: viewer.company?.name ?? "—",
  });
  const resolvedAttachments = await resolveAttachmentLinks(attachments);

  const react = BroadcastEmail({ subject, body: renderedBody, attachments: resolvedAttachments });

  // Même canal que l'envoi réel : le test vérifie aussi la configuration Brevo.
  const brevo = await getBrevoConfig();
  if (isBrevoReady(brevo)) {
    const html = await render(react);
    const { errors } = await sendBrevoBatch(
      brevo,
      {
        subject: `[TEST] ${subject}`,
        htmlContent: html,
        textContent: toPlainText(html),
        replyTo: CEO_SUMMIT_CONTACT.email,
        tag: "broadcast-test",
      },
      [{ email: viewer.email, name: viewer.name }]
    );
    if (errors.length > 0) return { success: false, error: errors[0] };
    return { success: true, data: undefined };
  }

  await sendTransactionalEmail({ to: viewer.email, subject: `[TEST] ${subject}`, react });
  return { success: true, data: undefined };
}

/** E8-T09 — envoi réel à un segment de membres, un email par destinataire. */
export async function sendBroadcast(
  subject: string,
  body: string,
  segment: SendableSegment,
  country?: string,
  sector?: string,
  planIds?: string[],
  attachments?: BroadcastAttachmentInput[]
): Promise<
  ActionResult<{
    id: string;
    recipientCount: number;
    failedCount: number;
    channel: "brevo" | "smtp";
    failureReason: string | null;
  }>
> {
  const { userId: adminId } = await requireAdmin("communications");

  const parsedContent = broadcastContentSchema.safeParse({ subject, body });
  const parsedSegment = broadcastSegmentSchema.safeParse(segment);
  if (!parsedContent.success || !parsedSegment.success) {
    return {
      success: false,
      error: parsedContent.error?.issues[0]?.message ?? "Segment invalide.",
    };
  }
  ({ subject, body } = parsedContent.data);
  segment = parsedSegment.data;

  const recipients = await prisma.user.findMany({
    where: buildBroadcastRecipientsWhere(segment, { country, sector, planIds }),
    include: VIEWER_TIER_INCLUDE,
  });
  if (recipients.length === 0) {
    return { success: false, error: "Aucun destinataire ne correspond à ce segment." };
  }

  // Une seule résolution pour tout le monde — même lien signé envoyé à
  // chaque destinataire, pas la peine de le régénérer par personne.
  const resolvedAttachments = await resolveAttachmentLinks(attachments);
  const validAttachmentKeys = (attachments ?? [])
    .filter((a) => isKeyUnderPrefix(a.key, "broadcasts/"))
    .map((a) => a.key);

  const broadcast = await prisma.broadcast.create({
    data: {
      subject,
      body,
      segment,
      segmentCountry: segment === "CUSTOM" ? country || null : null,
      segmentSector: segment === "CUSTOM" ? sector || null : null,
      segmentPlanIds: segment === "CUSTOM" ? (planIds ?? []) : [],
      attachmentKeys: validAttachmentKeys,
      sentById: adminId,
      recipientCount: recipients.length,
    },
  });

  // 21 oct. 2026 — par Brevo quand il est configuré (Paramètres ›
  // Intégrations) : un appel par tranche de 1000 destinataires, le prénom,
  // le nom et l'entreprise passés en paramètres Brevo ({{ params.prenom }}).
  const brevo = await getBrevoConfig();
  let sends: { userId: string; resendMessageId: string | null; delivered: boolean }[];
  let failureReason: string | null = null;
  const channel = isBrevoReady(brevo) ? "brevo" : "smtp";

  if (isBrevoReady(brevo)) {
    const html = await render(
      BroadcastEmail({
        subject,
        body: renderBroadcastBody(body, {
          prenom: "{{ params.prenom }}",
          nom: "{{ params.nom }}",
          entreprise: "{{ params.entreprise }}",
        }),
        attachments: resolvedAttachments,
      })
    );
    const { results, errors } = await sendBrevoBatch(
      brevo,
      {
        subject,
        htmlContent: html,
        textContent: toPlainText(html),
        replyTo: CEO_SUMMIT_CONTACT.email,
        tag: `broadcast-${broadcast.id}`,
      },
      recipients.map((recipient) => {
        const { prenom, nom } = splitName(recipient.name);
        return {
          email: recipient.email,
          name: recipient.name,
          params: { prenom, nom, entreprise: recipient.company?.name ?? "—" },
        };
      })
    );
    failureReason = errors[0] ?? null;
    sends = recipients.map((recipient, i) => ({
      userId: recipient.id,
      resendMessageId: results[i]?.messageId ?? null,
      delivered: results[i]?.delivered ?? false,
    }));
  } else {
    sends = await mapWithConcurrency(recipients, SMTP_CONCURRENCY, async (recipient) => {
      const { prenom, nom } = splitName(recipient.name);
      const renderedBody = renderBroadcastBody(body, {
        prenom,
        nom,
        entreprise: recipient.company?.name ?? "—",
      });

      try {
        const data = await sendTransactionalEmail({
          to: recipient.email,
          subject,
          react: BroadcastEmail({ subject, body: renderedBody, attachments: resolvedAttachments }),
        });
        return { userId: recipient.id, resendMessageId: data?.id ?? null, delivered: true };
      } catch (err) {
        console.error("[broadcast] failed to send to", recipient.email, err);
        return { userId: recipient.id, resendMessageId: null, delivered: false };
      }
    });
  }

  await prisma.broadcastRecipient.createMany({
    data: sends.map((s) => ({
      broadcastId: broadcast.id,
      userId: s.userId,
      resendMessageId: s.resendMessageId,
    })),
  });

  revalidatePath("/admin/communications");
  // Remonté à l'admin : un échec d'envoi (SMTP absent ou refusé) était
  // jusqu'ici avalé, et l'écran annonçait "envoyé à N membres" quand même.
  const failedCount = sends.filter((s) => !s.delivered).length;
  return {
    success: true,
    data: {
      id: broadcast.id,
      recipientCount: recipients.length,
      failedCount,
      channel,
      failureReason,
    },
  };
}
