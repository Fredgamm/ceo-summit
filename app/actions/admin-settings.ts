"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { pluralize } from "@/lib/utils";
import { emailSchema } from "@/lib/validations/auth";
import { ADMIN_INVITE_TTL_MS, generateSecureToken } from "@/lib/tokens";
import { resolveEmail } from "@/lib/email-template-resolver";
import { sendTransactionalEmail } from "@/lib/resend";
import { appUrl } from "@/lib/app-url";
import { attachToStaffOrganization, getStaffOrganization } from "@/lib/staff-organization";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const REFERENTIAL_TYPES = ["sector", "country", "opportunity_type"] as const;
const referentialLabelSchema = z.string().trim().min(1, "Le libellé est requis").max(100);

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

/**
 * Secteur, pays et type d'opportunité sont stockés en texte (pas de clé
 * étrangère vers `Referential`) : supprimer une valeur encore utilisée
 * laisserait les fiches concernées avec une valeur hors liste, refusée à leur
 * prochaine sauvegarde. Compte donc les usages avant d'autoriser la suppression.
 */
async function countReferentialUsage(
  type: (typeof REFERENTIAL_TYPES)[number],
  label: string
): Promise<number> {
  if (type === "opportunity_type") {
    return prisma.opportunity.count({ where: { type: label } });
  }
  const [companies, opportunities, users] = await Promise.all([
    prisma.company.count({ where: { [type]: label } }),
    prisma.opportunity.count({ where: { [type]: label } }),
    type === "sector"
      ? prisma.user.count({ where: { sectors: { has: label } } })
      : prisma.user.count({ where: { country: label } }),
  ]);
  return companies + opportunities + users;
}

export async function deleteReferentialItem(id: string): Promise<ActionResult> {
  await requireAdmin("parametres");

  const item = await prisma.referential.findUnique({ where: { id } });
  if (!item) return { success: false, error: "Élément introuvable." };

  const usageCount = await countReferentialUsage(
    item.type as (typeof REFERENTIAL_TYPES)[number],
    item.label
  );
  if (usageCount > 0) {
    return {
      success: false,
      error: `Impossible de supprimer « ${item.label} » : encore utilisé par ${pluralize(usageCount, "fiche")}.`,
    };
  }

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

  const granted = await grantAdminRole(user.id, role, actingAdminId);
  if (!granted.ok) return { success: false, error: granted.error };

  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}

const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  MODERATEUR: "Modérateur",
  FINANCIER: "Financier",
};

/**
 * 26 oct. 2026 — l'administrateur promu rejoint l'organisation staff ; si
 * c'est impossible (il gère une autre organisation qui a des membres), rien
 * n'est accordé.
 */
async function grantAdminRole(
  userId: string,
  role: AdminRole,
  actingAdminId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffOrganization();
  const attached = await prisma.$transaction(async (tx) => {
    if (staff) {
      const result = await attachToStaffOrganization(tx, userId, staff.id);
      if (!result.ok) return result;
    }
    await tx.adminUser.create({ data: { userId, role } });
    await tx.user.update({
      where: { id: userId },
      data: { role: "ADMIN", isPlatformAdmin: true },
    });
    return { ok: true as const };
  });
  if (!attached.ok) return attached;

  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: "admin.promote",
      targetType: "AdminUser",
      targetId: userId,
      metadata: { role },
    },
  });
  return { ok: true };
}

/**
 * Lien « choisir mon mot de passe » (même page que la réinitialisation),
 * valable 72 h ; les liens précédents de ce compte ne valent plus rien.
 * Renvoie `false` si l'e-mail n'a pas pu partir : le compte reste créé.
 */
async function sendAdminInvite(
  user: { id: string; name: string; email: string },
  role: AdminRole
): Promise<boolean> {
  const token = generateSecureToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + ADMIN_INVITE_TTL_MS) },
    }),
  ]);
  try {
    const email = await resolveEmail("admin-invite", {
      memberName: user.name,
      roleLabel: ADMIN_ROLE_LABEL[role],
      inviteUrl: `${appUrl()}/reinitialiser/${token}`,
    });
    if (!email) return false;
    await sendTransactionalEmail({ to: user.email, ...email });
    return true;
  } catch (err) {
    console.error("[sendAdminInvite] failed to send admin invite", err);
    return false;
  }
}

const createAdminSchema = z.object({
  name: z.string().trim().min(2, "Le nom est requis").max(120),
  email: emailSchema,
  role: z.enum(["SUPER_ADMIN", "MODERATEUR", "FINANCIER"]),
});

/**
 * 25 oct. 2026 — ajout d'un administrateur sans compte membre préalable : le
 * super admin choisit nom, e-mail et rôle. Nouveau compte → créé actif, sans
 * mot de passe, et la personne reçoit un lien pour choisir le sien. E-mail
 * déjà inscrit → le compte est promu (lien envoyé seulement s'il n'a jamais
 * eu de mot de passe ; `emailSent: null` = rien à envoyer).
 */
export async function createAdminAccount(
  input: unknown
): Promise<ActionResult<{ created: boolean; emailSent: boolean | null }>> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  const parsed = createAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { name, role } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, passwordHash: true },
  });

  if (existing) {
    const existingAdmin = await prisma.adminUser.findUnique({ where: { userId: existing.id } });
    if (existingAdmin) return { success: false, error: "Ce compte est déjà administrateur." };
    const granted = await grantAdminRole(existing.id, role, actingAdminId);
    if (!granted.ok) return { success: false, error: granted.error };
    const emailSent = existing.passwordHash ? null : await sendAdminInvite(existing, role);
    revalidatePath("/admin/parametres");
    return { success: true, data: { created: false, emailSent } };
  }

  const now = new Date();
  const staff = await getStaffOrganization();
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        role: "ADMIN",
        isPlatformAdmin: true,
        companyId: staff?.id ?? null,
        status: "ACTIVE",
        emailVerifiedAt: now,
        onboardingCompletedAt: now,
      },
      select: { id: true, name: true, email: true },
    });
    await tx.adminUser.create({ data: { userId: created.id, role } });
    await tx.auditLog.create({
      data: {
        actorId: actingAdminId,
        action: "admin.create",
        targetType: "AdminUser",
        targetId: created.id,
        metadata: { role, email },
      },
    });
    return created;
  });

  const emailSent = await sendAdminInvite(user, role);
  revalidatePath("/admin/parametres");
  return { success: true, data: { created: true, emailSent } };
}

/** Renvoie le lien à un administrateur qui n'a pas encore choisi son mot de passe. */
export async function resendAdminInvite(adminUserId: string): Promise<ActionResult> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  const admin = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!admin) return { success: false, error: "Compte administrateur introuvable." };
  const user = await prisma.user.findUnique({
    where: { id: admin.userId },
    select: { id: true, name: true, email: true, passwordHash: true },
  });
  if (!user) return { success: false, error: "Compte introuvable." };
  if (user.passwordHash) {
    return {
      success: false,
      error: "Ce compte a déjà un mot de passe : utilisez « Mot de passe oublié ».",
    };
  }

  const sent = await sendAdminInvite(user, admin.role);
  if (!sent) return { success: false, error: "L'e-mail n'a pas pu être envoyé. Réessayez." };
  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: "admin.resend_invite",
      targetType: "AdminUser",
      targetId: user.id,
    },
  });
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

/**
 * 26 oct. 2026 — rattache à l'organisation staff un administrateur qui n'y
 * est pas encore (créé ou promu avant cette règle).
 */
export async function attachAdminToStaff(adminUserId: string): Promise<ActionResult> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  const admin = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!admin) return { success: false, error: "Compte administrateur introuvable." };
  const staff = await getStaffOrganization();
  if (!staff) {
    return { success: false, error: "Désignez d'abord l'organisation du staff." };
  }

  const result = await prisma.$transaction((tx) =>
    attachToStaffOrganization(tx, admin.userId, staff.id)
  );
  if (!result.ok) return { success: false, error: result.error };

  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: "admin.attach_staff",
      targetType: "AdminUser",
      targetId: admin.userId,
      metadata: { companyId: staff.id },
    },
  });
  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}

/**
 * Désigne l'organisation du staff, une seule fois : la migration
 * 20261026100000_staff_organization la fixe déjà quand « CEO Summit » existe.
 */
export async function designateStaffOrganization(companyId: string): Promise<ActionResult> {
  const { userId: actingAdminId } = await requireAdmin("parametres");

  if (await getStaffOrganization()) {
    return { success: false, error: "L'organisation du staff est déjà désignée." };
  }
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { success: false, error: "Organisation introuvable." };

  await prisma.company.update({ where: { id: companyId }, data: { isStaffOrganization: true } });
  await prisma.auditLog.create({
    data: {
      actorId: actingAdminId,
      action: "admin.designate_staff_organization",
      targetType: "Company",
      targetId: companyId,
    },
  });
  revalidatePath("/admin/parametres");
  return { success: true, data: undefined };
}
