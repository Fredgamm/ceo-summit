"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { SHOW_STAFF_SETTING_KEY } from "@/lib/staff-visibility";

type ActionResult = { success: true } | { success: false; error: string };

/** 23 oct. 2026 — affiche ou masque le staff dans l'annuaire des membres. */
export async function updateShowStaffInDirectory(show: boolean): Promise<ActionResult> {
  const { userId } = await requireAdmin("parametres");
  const key = SHOW_STAFF_SETTING_KEY;
  const value = show ? "true" : "false";

  await prisma.$transaction([
    prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "settings.directory.update",
        targetType: "PlatformSetting",
        targetId: key,
        metadata: { showStaff: show },
      },
    }),
  ]);

  revalidatePath("/admin/parametres");
  revalidatePath("/catalogue");
  revalidatePath("/dashboard");
  return { success: true };
}
