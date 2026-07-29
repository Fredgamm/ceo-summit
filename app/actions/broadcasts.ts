"use server";

import { revalidatePath } from "next/cache";
import type { BroadcastSegment } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildBroadcastRecipientsWhere } from "@/lib/broadcast-segments";
import { renderBroadcastBody } from "@/lib/broadcast-template";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import BroadcastEmail from "@/emails/broadcast-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

function splitName(name: string): { prenom: string; nom: string } {
  const [prenom, ...rest] = name.trim().split(" ");
  return { prenom: prenom ?? name, nom: rest.join(" ") || "—" };
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
  sector?: string
): Promise<ActionResult<{ count: number }>> {
  await requireAdmin("communications");

  const count = await prisma.user.count({
    where: buildBroadcastRecipientsWhere("CUSTOM", { country, sector }),
  });
  return { success: true, data: { count } };
}

/** E8-T09 — "✉ Tester" : envoie uniquement à l'admin connecté, avec ses propres variables. */
export async function sendTestBroadcast(subject: string, body: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };
  await requireAdmin("communications");

  if (!subject.trim() || !body.trim()) {
    return { success: false, error: "L'objet et le corps du message sont requis." };
  }

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      company: { select: { name: true } },
      memberships: { where: { status: "ACTIVE" }, take: 1 },
    },
  });
  if (!viewer) return { success: false, error: "Non authentifié." };

  const { prenom, nom } = splitName(viewer.name);
  const renderedBody = renderBroadcastBody(body, {
    prenom,
    nom,
    tier: viewer.memberships[0]?.tier ?? "Admin",
    entreprise: viewer.company?.name ?? "—",
  });

  await sendTransactionalEmail({
    to: viewer.email,
    subject: `[TEST] ${subject}`,
    react: BroadcastEmail({ subject, body: renderedBody }),
  });

  return { success: true, data: undefined };
}

/** E8-T09 — envoi réel à un segment de membres, un email par destinataire. */
export async function sendBroadcast(
  subject: string,
  body: string,
  segment: BroadcastSegment,
  country?: string,
  sector?: string
): Promise<ActionResult<{ id: string; recipientCount: number }>> {
  const { userId: adminId } = await requireAdmin("communications");

  if (!subject.trim() || !body.trim()) {
    return { success: false, error: "L'objet et le corps du message sont requis." };
  }

  const recipients = await prisma.user.findMany({
    where: buildBroadcastRecipientsWhere(segment, { country, sector }),
    include: {
      company: { select: { name: true } },
      memberships: { where: { status: "ACTIVE" }, take: 1 },
    },
  });
  if (recipients.length === 0) {
    return { success: false, error: "Aucun destinataire ne correspond à ce segment." };
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      subject,
      body,
      segment,
      segmentCountry: segment === "CUSTOM" ? country || null : null,
      segmentSector: segment === "CUSTOM" ? sector || null : null,
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
        tier: recipient.memberships[0]?.tier ?? "Membre",
        entreprise: recipient.company?.name ?? "—",
      });

      try {
        const data = await sendTransactionalEmail({
          to: recipient.email,
          subject,
          react: BroadcastEmail({ subject, body: renderedBody }),
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
