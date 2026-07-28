"use server";

import { revalidatePath } from "next/cache";
import type { ReportStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import MemberRoomWarningEmail from "@/emails/member-room-warning-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/** E4-T04 — "Archivage salle (masquage membres, conservation historique)". */
export async function archiveRoom(roomId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("salles");

  await prisma.room.update({ where: { id: roomId }, data: { status: "ARCHIVED" } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "room.archive", targetType: "Room", targetId: roomId },
  });

  revalidatePath("/admin/salles");
  revalidatePath("/salles");
  return { success: true, data: undefined };
}

export async function restoreRoom(roomId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("salles");

  await prisma.room.update({ where: { id: roomId }, data: { status: "ACTIVE" } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "room.restore", targetType: "Room", targetId: roomId },
  });

  revalidatePath("/admin/salles");
  revalidatePath("/salles");
  return { success: true, data: undefined };
}

/**
 * E4-T04 — "Gestion signalements" : les 4 issues du modal wireframe
 * (bo-salles.html) mappent 1:1 sur ReportStatus. `durationDays` n'est
 * utilisé (et requis) que pour RESOLVED_EXCLUDED — "durée configurable"
 * de la suspension.
 */
export async function resolveRoomReport(
  reportId: string,
  decision: ReportStatus,
  durationDays?: number
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("salles");

  const report = await prisma.roomReport.findUnique({
    where: { id: reportId },
    include: { roomMessage: { include: { room: true, author: true } } },
  });
  if (!report) return { success: false, error: "Signalement introuvable." };
  if (report.status !== "PENDING")
    return { success: false, error: "Ce signalement a déjà été traité." };

  const { roomMessage } = report;

  if (decision === "RESOLVED_DELETED") {
    await prisma.roomMessage.update({
      where: { id: roomMessage.id },
      data: { deletedAt: new Date() },
    });
  } else if (decision === "RESOLVED_WARNED") {
    await sendTransactionalEmail({
      to: roomMessage.author.email,
      subject: `Avertissement — salle ${roomMessage.room.name}`,
      react: MemberRoomWarningEmail({ roomName: roomMessage.room.name }),
    });
  } else if (decision === "RESOLVED_EXCLUDED") {
    const days = durationDays && durationDays > 0 ? durationDays : 7;
    await prisma.roomSuspension.create({
      data: {
        roomId: roomMessage.roomId,
        userId: roomMessage.authorId,
        reason: "Message signalé — exclusion de la salle",
        suspendedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        createdById: adminId,
      },
    });
  }

  await prisma.roomReport.update({
    where: { id: reportId },
    data: { status: decision, resolvedById: adminId, resolvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "room.report.resolve",
      targetType: "RoomReport",
      targetId: reportId,
      metadata: { decision },
    },
  });

  revalidatePath("/admin/salles");
  return { success: true, data: undefined };
}
