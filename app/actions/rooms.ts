"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import AdminRoomReportAlertEmail from "@/emails/admin-room-report-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const idSchema = z.string().min(1);

/** E4-T02 — badge "nouveau message" : marque la salle comme lue à l'instant présent. */
export async function markRoomAsRead(roomId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };
  if (!idSchema.safeParse(roomId).success) return { success: false, error: "Requête invalide." };

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

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) return { success: false, error: "Non authentifié." };

  await prisma.roomReport.create({
    data: { roomMessageId, reportedById: viewer.id, status: "PENDING" },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    await sendTransactionalEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Message signalé — ${message.room.name}`,
      react: AdminRoomReportAlertEmail({ reporterName: viewer.name, roomName: message.room.name }),
    });
  }

  revalidatePath("/admin/salles");
  return { success: true, data: undefined };
}
