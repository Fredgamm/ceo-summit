"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import MemberSuspendedEmail from "@/emails/member-suspended-email";
import MemberExcludedEmail from "@/emails/member-excluded-email";
import MemberReactivatedEmail from "@/emails/member-reactivated-email";

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

  const member = await prisma.user.update({ where: { id: userId }, data: { status } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action, targetType: "User", targetId: userId },
  });

  /**
   * 22 septembre 2026 (audit des emails transactionnels) — sans ça, un
   * membre suspendu/exclu/réactivé ne l'apprenait qu'en essayant de se
   * connecter, jamais notifié directement.
   */
  try {
    if (status === "SUSPENDED") {
      await sendTransactionalEmail({
        to: member.email,
        subject: "Votre compte CEO Summit a été suspendu",
        react: MemberSuspendedEmail({ memberName: member.name }),
      });
    } else if (status === "CANCELLED") {
      await sendTransactionalEmail({
        to: member.email,
        subject: "Votre compte CEO Summit a été résilié",
        react: MemberExcludedEmail({ memberName: member.name }),
      });
    } else {
      await sendTransactionalEmail({
        to: member.email,
        subject: "Votre compte CEO Summit a été réactivé",
        react: MemberReactivatedEmail({
          memberName: member.name,
          loginUrl: `${process.env.NEXTAUTH_URL}/login`,
        }),
      });
    }
  } catch (err) {
    console.error("[setMemberStatus] failed to send status change email", err);
  }

  revalidatePath(`/admin/membres/${userId}`);
  return { success: true, data: undefined };
}

export const suspendMember = (userId: string) =>
  setMemberStatus(userId, "SUSPENDED", "member.suspend");
export const excludeMember = (userId: string) =>
  setMemberStatus(userId, "CANCELLED", "member.exclude");
export const reactivateMember = (userId: string) =>
  setMemberStatus(userId, "ACTIVE", "member.reactivate");

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("membres");

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
