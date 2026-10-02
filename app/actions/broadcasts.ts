"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { BroadcastSegment } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildBroadcastRecipientsWhere } from "@/lib/broadcast-segments";
import { renderBroadcastBody } from "@/lib/broadcast-template";
import { requireAdmin } from "@/lib/admin-auth";
import { requireViewer } from "@/lib/require-viewer";
import { sendTransactionalEmail } from "@/lib/resend";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getSignedDownloadUrl, isKeyUnderPrefix } from "@/lib/r2";
import { BROADCAST_ATTACHMENT_LINK_TTL_SECONDS } from "@/lib/validations/broadcast";
import { tierLabel } from "@/lib/utils";
import BroadcastEmail from "@/emails/broadcast-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

export interface BroadcastAttachmentInput {
  key: string;
  name: string;
}

const broadcastContentSchema = z.object({
  subject: z.string().trim().min(1, "L'objet est requis").max(200),
  body: z.string().trim().min(1, "Le corps du message est requis").max(20_000),
});
const broadcastSegmentSchema = z.enum(["ALL_ACTIVE", "CHAIRMAN", "EXECUTIVE", "CUSTOM"]);

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
export async function getSegmentCounts(): Promise<
  ActionResult<{ ALL_ACTIVE: number; CHAIRMAN: number; EXECUTIVE: number }>
> {
  await requireAdmin("communications");

  const [allActive, chairman, executive] = await Promise.all([
    prisma.user.count({ where: buildBroadcastRecipientsWhere("ALL_ACTIVE") }),
    prisma.user.count({ where: buildBroadcastRecipientsWhere("CHAIRMAN") }),
    prisma.user.count({ where: buildBroadcastRecipientsWhere("EXECUTIVE") }),
  ]);

  return {
    success: true,
    data: { ALL_ACTIVE: allActive, CHAIRMAN: chairman, EXECUTIVE: executive },
  };
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
    tier: tierLabel(getViewerTierFromCompany(viewer.company)),
    entreprise: viewer.company?.name ?? "—",
  });
  const resolvedAttachments = await resolveAttachmentLinks(attachments);

  await sendTransactionalEmail({
    to: viewer.email,
    subject: `[TEST] ${subject}`,
    react: BroadcastEmail({ subject, body: renderedBody, attachments: resolvedAttachments }),
  });

  return { success: true, data: undefined };
}

/** E8-T09 — envoi réel à un segment de membres, un email par destinataire. */
export async function sendBroadcast(
  subject: string,
  body: string,
  segment: BroadcastSegment,
  country?: string,
  sector?: string,
  planIds?: string[],
  attachments?: BroadcastAttachmentInput[]
): Promise<ActionResult<{ id: string; recipientCount: number }>> {
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

  const sends = await Promise.all(
    recipients.map(async (recipient) => {
      const { prenom, nom } = splitName(recipient.name);
      const renderedBody = renderBroadcastBody(body, {
        prenom,
        nom,
        tier: tierLabel(getViewerTierFromCompany(recipient.company)),
        entreprise: recipient.company?.name ?? "—",
      });

      try {
        const data = await sendTransactionalEmail({
          to: recipient.email,
          subject,
          react: BroadcastEmail({ subject, body: renderedBody, attachments: resolvedAttachments }),
        });
        return { userId: recipient.id, resendMessageId: data?.id ?? null };
      } catch (err) {
        console.error("[broadcast] failed to send to", recipient.email, err);
        return { userId: recipient.id, resendMessageId: null };
      }
    })
  );

  await prisma.broadcastRecipient.createMany({
    data: sends.map((s) => ({
      broadcastId: broadcast.id,
      userId: s.userId,
      resendMessageId: s.resendMessageId,
    })),
  });

  revalidatePath("/admin/communications");
  return { success: true, data: { id: broadcast.id, recipientCount: recipients.length } };
}
