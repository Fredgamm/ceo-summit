"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const grantCreditsSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().trim().max(500).optional().default(""),
});
const noteSchema = z.string().trim().max(5000);

/**
 * E8-T04 — gestion membres : suspendre/exclure/réactiver, attribuer des
 * crédits, note interne. All actions revalidate the member's own detail page
 * since that's the only place they're called from today.
 *
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — `changeMemberTier` a
 * été retiré : le tier n'est plus un attribut personnel modifiable par
 * l'admin, il est dérivé du rang de l'offre plateforme de l'entreprise du
 * membre (lib/plan-access.ts::getViewerTierFromCompany). Changer le niveau
 * d'accès d'un membre passe désormais par le changement d'offre de son
 * entreprise, pas par une action individuelle.
 */

async function setMemberStatus(
  userId: string,
  status: "SUSPENDED" | "CANCELLED" | "ACTIVE",
  action: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("membres");

  await prisma.user.update({ where: { id: userId }, data: { status } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action, targetType: "User", targetId: userId },
  });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

export const suspendMember = (userId: string) =>
  setMemberStatus(userId, "SUSPENDED", "member.suspend");
export const excludeMember = (userId: string) =>
  setMemberStatus(userId, "CANCELLED", "member.exclude");
export const reactivateMember = (userId: string) =>
  setMemberStatus(userId, "ACTIVE", "member.reactivate");

/**
 * RGPD — droit à l'effacement (audit du 7 août : "impossible, relations
 * Prisma en Restrict"). Une vraie suppression de ligne `User` casserait les
 * FK Restrict de tout ce que ce membre a produit (messages, opportunités,
 * logs d'audit...) et invaliderait rétroactivement les échanges des AUTRES
 * membres avec lui. Anonymise à la place : la ligne survit (intégrité
 * référentielle préservée pour tout le monde), les données personnelles
 * identifiantes non. `status` passe à CANCELLED au même moment, ce qui coupe
 * aussi l'accès (voir requireViewer()/requireAdmin() — vérifiés à chaque
 * appel depuis le sprint du 7 août). Irréversible : contrairement à
 * suspendre/exclure, aucune action "annuler" n'existe pour ceci.
 *
 * Hors périmètre volontaire : les fichiers déjà uploadés sur R2 (avatar,
 * pièces jointes envoyées) ne sont pas supprimés du bucket — nécessiterait
 * un accès R2 réel pour être vérifié, pas disponible dans cet environnement
 * de dev. La note admin interne (`adminNote`) n'est pas effacée non plus :
 * historique de modération, pas une donnée personnelle du membre lui-même.
 * Si le membre est admin d'une entreprise, cette action ne réassigne pas
 * automatiquement ce rôle — utiliser `reassignCompanyAdmin` séparément.
 */
export async function eraseUserData(userId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("membres");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "Membre introuvable." };
  if (user.erasedAt) {
    return { success: false, error: "Les données de ce membre ont déjà été effacées." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: "Membre supprimé",
      email: `erased-${userId}@erased.ceosummit.invalid`,
      passwordHash: null,
      title: null,
      bio: null,
      avatarUrl: null,
      linkedinUrl: null,
      phone: null,
      country: null,
      sectors: [],
      status: "CANCELLED",
      erasedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "member.erase_data", targetType: "User", targetId: userId },
  });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("credits");

  const parsed = grantCreditsSchema.safeParse({ amount, reason });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  ({ amount, reason } = parsed.data);

  await prisma.creditBalance.upsert({
    where: { userId },
    update: { purchased: { increment: amount } },
    create: { userId, included: 0, purchased: amount, used: 0 },
  });

  await prisma.creditTransaction.create({
    data: { userId, amount, type: "ADMIN_GRANT", reason: reason || undefined },
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "member.grant_credits",
      targetType: "User",
      targetId: userId,
      metadata: { amount, reason },
    },
  });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

export async function saveMemberNote(userId: string, note: string): Promise<ActionResult> {
  await requireAdmin("membres");

  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return { success: false, error: "Note invalide." };

  await prisma.user.update({ where: { id: userId }, data: { adminNote: parsed.data } });

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}
