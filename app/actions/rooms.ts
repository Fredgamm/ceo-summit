"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { meetsRoomAccess } from "@/lib/rooms-query";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import { requireViewer } from "@/lib/require-viewer";
import AdminRoomReportAlertEmail from "@/emails/admin-room-report-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const idSchema = z.string().min(1);

/** E4-T02 — badge "nouveau message" : marque la salle comme lue à l'instant présent. */
export async function markRoomAsRead(roomId: string): Promise<ActionResult> {
  // Correctif (refactor dette technique, sept. 2026) — audit du 7 août :
  // `requireViewer()` remplace un `auth()` brut ici, ce qui referme au passage
  // "session non révoquée après sanction" (relit `User.status` en base, un
  // membre suspendu/exclu ne pouvait plus rien faire ailleurs via ce helper,
  // mais pouvait toujours marquer une salle comme lue depuis ce fichier).
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (!idSchema.safeParse(roomId).success) return { success: false, error: "Requête invalide." };

  // Contrairement à handleJoin/handleMessage (server/socket-server.ts) et à
  // la route d'upload, cette action ne revérifiait jamais le tier — un id
  // de salle deviné (cuid) permettait de marquer une salle non autorisée
  // comme lue. Faible exploitabilité mais gap réel.
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { success: false, error: "Salle introuvable." };
  if (!meetsRoomAccess(getViewerTierFromCompany(viewer.company), room.minTier)) {
    return { success: false, error: "Accès non autorisé à cette salle." };
  }

  await prisma.roomRead.upsert({
    where: { roomId_userId: { roomId, userId: viewer.id } },
    update: { lastReadAt: new Date() },
    create: { roomId, userId: viewer.id, lastReadAt: new Date() },
  });

  return { success: true, data: undefined };
}

/** E4-T03/T04 — "Bouton signalement message → alerte admin". */
export async function reportRoomMessage(roomMessageId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
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
    where: { roomMessageId, reportedById: viewer.id },
  });
  if (existing) {
    return { success: false, error: "Vous avez déjà signalé ce message." };
  }

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
