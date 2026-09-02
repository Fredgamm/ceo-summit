"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { meetsRoomAccess } from "@/lib/rooms-query";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import AdminRoomReportAlertEmail from "@/emails/admin-room-report-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const idSchema = z.string().min(1);

/** E4-T02 — badge "nouveau message" : marque la salle comme lue à l'instant présent. */
export async function markRoomAsRead(roomId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };
  if (!idSchema.safeParse(roomId).success) return { success: false, error: "Requête invalide." };

  // Correctif (refactor dette technique, sept. 2026) — audit du 7 août :
  // contrairement à handleJoin/handleMessage (server/socket-server.ts) et à
  // la route d'upload, cette action ne revérifiait jamais le tier — un id
  // de salle deviné (cuid) permettait de marquer une salle non autorisée
  // comme lue. Faible exploitabilité mais gap réel.
  const [room, viewer] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.user.findUnique({ where: { id: session.user.id }, include: VIEWER_TIER_INCLUDE }),
  ]);
  if (!room) return { success: false, error: "Salle introuvable." };
  if (!viewer || !meetsRoomAccess(getViewerTierFromCompany(viewer.company), room.minTier)) {
    return { success: false, error: "Accès non autorisé à cette salle." };
  }

  await prisma.roomRead.upsert({
    where: { roomId_userId: { roomId, userId: session.user.id } },
    update: { lastReadAt: new Date() },
    create: { roomId, userId: session.user.id, lastReadAt: new Date() },
  });

  return { success: true, data: undefined };
}

/** E4-T03/T04 — "Bouton signalement message → alerte admin". */
export async function reportRoomMessage(roomMessageId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };
  if (!idSchema.safeParse(roomMessageId).success) {
    return { success: false, error: "Requête invalide." };
  }

  const message = await prisma.roomMessage.findUnique({
    where: { id: roomMessageId },
    include: { room: true },
  });
  if (!message || message.deletedAt) {
    return { success: false, error: "Ce message n'existe plus." };
  }

  const existing = await prisma.roomReport.findFirst({
    where: { roomMessageId, reportedById: session.user.id },
  });
  if (existing) {
    return { success: false, error: "Vous avez déjà signalé ce message." };
  }

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) return { success: false, error: "Non authentifié." };
  // Correctif (refactor dette technique, sept. 2026) — audit du 7 août :
  // même gap que markRoomAsRead, cette fois sur un id de message.
  if (!meetsRoomAccess(getViewerTierFromCompany(viewer.company), message.room.minTier)) {
    return { success: false, error: "Accès non autorisé à cette salle." };
  }

  await prisma.roomReport.create({
    data: { roomMessageId, reportedById: viewer.id, status: "PENDING" },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Message signalé — ${message.room.name}`,
        react: AdminRoomReportAlertEmail({
          reporterName: viewer.name,
          roomName: message.room.name,
        }),
      });
    } catch (err) {
      // Le signalement est déjà enregistré à ce stade — un échec d'envoi de
      // l'alerte admin ne doit pas faire échouer l'action (même bug de
      // classe que celui corrigé sur signup() le 1er août 2026).
      console.error("[reportRoomMessage] failed to send admin alert email", err);
    }
  }

  revalidatePath("/admin/salles");
  return { success: true, data: undefined };
}
