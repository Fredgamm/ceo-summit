import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * 26 oct. 2026 — organisation unique du staff CEO Summit
 * (`Company.isStaffOrganization`). Deux règles :
 *
 * - tous les administrateurs de la plateforme y sont rattachés : à leur
 *   création, à leur promotion, ou depuis Admin › Paramètres ;
 * - tout super admin actif la gère comme son gérant (inviter, désigner les
 *   participants, modifier la fiche, choisir l'offre staff), sans en être
 *   le `companyAdminId`.
 */

type Tx = Prisma.TransactionClient;

export async function getStaffOrganization() {
  return prisma.company.findFirst({
    where: { isStaffOrganization: true },
    select: { id: true, name: true },
  });
}

async function isActiveSuperAdmin(userId: string): Promise<boolean> {
  const admin = await prisma.adminUser.findUnique({
    where: { userId },
    select: { role: true, active: true },
  });
  return admin?.role === "SUPER_ADMIN" && admin.active;
}

/**
 * Le gérant de l'organisation, ou un super admin s'il s'agit de
 * l'organisation staff. Remplace `company.companyAdminId === viewer.id`
 * partout où l'organisation se gère.
 */
export async function canManageCompany(
  viewer: { id: string; isPlatformAdmin: boolean },
  company: { companyAdminId: string | null; isStaffOrganization?: boolean }
): Promise<boolean> {
  if (company.companyAdminId === viewer.id) return true;
  if (!company.isStaffOrganization || !viewer.isPlatformAdmin) return false;
  return isActiveSuperAdmin(viewer.id);
}

export type StaffAttachResult = { ok: true } | { ok: false; error: string };

/**
 * Rattache un compte à l'organisation staff. Un gérant d'une autre
 * organisation ne la quitte que s'il en est le seul membre actif (la fiche,
 * vide, perd alors son gérant) ; sinon il faut d'abord transférer la
 * gestion (Admin › Entreprises).
 */
export async function attachToStaffOrganization(
  tx: Tx,
  userId: string,
  staffCompanyId: string
): Promise<StaffAttachResult> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      companyId: true,
      companyAdminOf: {
        select: {
          id: true,
          name: true,
          _count: { select: { users: { where: { status: "ACTIVE", id: { not: userId } } } } },
        },
      },
    },
  });
  if (!user) return { ok: false, error: "Compte introuvable." };
  if (user.companyId === staffCompanyId) return { ok: true };

  const managed = user.companyAdminOf;
  if (managed && managed.id !== staffCompanyId) {
    if (managed._count.users > 0) {
      return {
        ok: false,
        error: `Ce compte gère « ${managed.name} », qui compte d'autres membres : transférez d'abord la gestion de cette organisation (Admin › Entreprises).`,
      };
    }
    await tx.company.update({ where: { id: managed.id }, data: { companyAdminId: null } });
  }

  await tx.user.update({ where: { id: userId }, data: { companyId: staffCompanyId } });
  return { ok: true };
}
