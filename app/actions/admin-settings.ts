"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { setDealRoomContactCost } from "@/lib/deal-room-settings";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const REFERENTIAL_TYPES = ["sector", "country", "opportunity_type"] as const;
const referentialLabelSchema = z.string().trim().min(1, "Le libellé est requis").max(100);

function parsePositiveInt(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// `saveMembershipTariffs` retiré (Phase 1 offres dynamiques, 30 juillet
// 2026) — les tarifs/crédits inclus par offre se gèrent depuis
// app/actions/admin-plans.ts maintenant, plus par les 3 tiers fixes.

/** E8-T11 — "Tarifs packs crédits Deal Room". */
export async function saveCreditPackPrices(
  packs: { credits: number; priceAr: string }[]
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("parametres");

  for (const pack of packs) {
    if (parsePositiveInt(pack.priceAr) === null) {
      return { success: false, error: `Tarif du pack ${pack.credits} crédits invalide.` };
    }
  }

  await Promise.all(
    packs.map((pack) =>
      prisma.creditPackPrice.upsert({
        where: { credits: pack.credits },
        update: { priceAr: parsePositiveInt(pack.priceAr)! },
        create: { credits: pack.credits, priceAr: parsePositiveInt(pack.priceAr)! },
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.update_credit_packs",
      targetType: "CreditPackPrice",
      targetId: "all",
    },
  });

  revalidatePath("/admin/parametres");
  revalidatePath("/credits/acheter");
  return { success: true, data: undefined };
}

/**
 * Coût en crédits du "Prendre contact" Deal Room, configurable (7 août
 * 2026, demande admin) — jusqu'ici une constante fixe. 0 = gratuit pour
 * tout le monde (Chairman reste de toute façon toujours gratuit).
 */
export async function updateDealRoomContactCost(cost: number): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("parametres");

  if (!Number.isFinite(cost) || cost < 0 || cost > 1000 || !Number.isInteger(cost)) {
    return { success: false, error: "Coût invalide (nombre entier entre 0 et 1000)." };
  }

  await setDealRoomContactCost(cost);

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "settings.update_deal_room_contact_cost",
      targetType: "PlatformSetting",
      targetId: "deal_room_contact_cost",
      metadata: { cost },
    },
  });

  revalidatePath("/admin/parametres");
  revalidatePath("/deal-room");
  return { success: true, data: undefined };
}

/**
 * E8-T11 — "Référentiels : secteurs, pays, types opportunité (CRUD)".
 * Opère sur le modèle `Referential` réel (existant mais jamais consommé) —
 * voir la note dans app/admin/parametres/page.tsx sur ce que ça branche ou
 * pas encore côté membre.
 */
export async function createReferentialItem(
  type: (typeof REFERENTIAL_TYPES)[number],
  label: string
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin("parametres");
  if (!REFERENTIAL_TYPES.includes(type)) return { success: false, error: "Type invalide." };
  const parsedLabel = referentialLabelSchema.safeParse(label);
  if (!parsedLabel.success) {
    return { success: false, error: parsedLabel.error.issues[0]?.message ?? "Libellé invalide" };
  }
  label = parsedLabel.data;

  const existing = await prisma.referential.findFirst({ where: { type, label } });
  if (existing) return { success: false, error: "Cet élément existe déjà." };

  const maxPosition = await prisma.referential.aggregate({
    where: { type },
    _max: { position: true },
  });
  const item = await prisma.referential.create({
    data: { type, label, position: (maxPosition._max.position ?? -1) + 1 },
  });

  revalidatePath("/admin/parametres");
  return { success: true, data: { id: item.id } };
}

export async function deleteReferentialItem(id: string): Promise<ActionResult> {
  await requireAdmin("parametres");

  await prisma.referential.delete({ where: { id } });

  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}

/** E8-T11 — "Gestion comptes admin + rôles". */
export async function promoteToAdmin(email: string, role: AdminRole): Promise<ActionResult> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    return {
      success: false,
      error: "Aucun membre trouvé avec cet email — le compte doit déjà exister.",
    };
  }

  const existingAdmin = await prisma.adminUser.findUnique({ where: { userId: user.id } });
  if (existingAdmin) return { success: false, error: "Ce membre est déjà administrateur." };

  await prisma.$transaction([
    prisma.adminUser.create({ data: { userId: user.id, role } }),
    prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN", isPlatformAdmin: true },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: "admin.promote",
      targetType: "AdminUser",
      targetId: user.id,
      metadata: { role },
    },
  });

  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}

export async function updateAdminRole(adminUserId: string, role: AdminRole): Promise<ActionResult> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  const target = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!target) return { success: false, error: "Compte administrateur introuvable." };
  if (target.userId === actingAdminId) {
    return { success: false, error: "Vous ne pouvez pas modifier votre propre rôle." };
  }
  // Toujours garder au moins un super-admin actif : lui seul accède à cet écran.
  if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const otherSuperAdmins = await prisma.adminUser.count({
      where: { role: "SUPER_ADMIN", active: true, id: { not: adminUserId } },
    });
    if (otherSuperAdmins === 0) {
      return { success: false, error: "Il doit rester au moins un super-administrateur actif." };
    }
  }

  await prisma.adminUser.update({ where: { id: adminUserId }, data: { role } });
  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: "admin.update_role",
      targetType: "AdminUser",
      targetId: adminUserId,
      metadata: { role },
    },
  });

  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}

/** Un admin ne peut pas se désactiver lui-même — évite un auto-verrouillage. */
export async function toggleAdminActive(adminUserId: string): Promise<ActionResult> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  const target = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!target) return { success: false, error: "Compte administrateur introuvable." };
  if (target.userId === actingAdminId) {
    return { success: false, error: "Vous ne pouvez pas désactiver votre propre compte." };
  }

  await prisma.adminUser.update({ where: { id: adminUserId }, data: { active: !target.active } });
  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: target.active ? "admin.deactivate" : "admin.reactivate",
      targetType: "AdminUser",
      targetId: adminUserId,
    },
  });

  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}
