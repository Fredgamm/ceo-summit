import type { Company, MembershipStatus, Plan, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * 22 septembre 2026 (`conception/12` §3.2) — nombre total de places d'un
 * abonnement : le quota de l'offre (fixe en `FIXED_BUNDLE`, déclaré et payé
 * en `PER_PARTICIPANT`) plus les places achetées en supplément
 * (`extraSeats`, offres `isUpsell`). `null` = aucune limite (offre sans
 * quota renseigné).
 */
export function seatCap(subscription: {
  plan: Pick<Plan, "pricingMode" | "maxTeamMembers">;
  declaredParticipants: number | null;
  extraSeats: number;
  /** Module 20 — nombre de membres fixé par l'admin pour cette entreprise (offres partenaires). */
  memberLimit?: number | null;
  /** 14 oct. 2026 — offre « Staff » d'un administrateur de la plateforme : pas de plafond. */
  unlimitedSeats?: boolean;
}): number | null {
  if (subscription.unlimitedSeats) return null;
  const base =
    subscription.memberLimit != null
      ? subscription.memberLimit
      : subscription.plan.pricingMode === "PER_PARTICIPANT"
        ? subscription.declaredParticipants
        : subscription.plan.maxTeamMembers;
  return base == null ? null : base + subscription.extraSeats;
}

/**
 * Audit (25 septembre 2026) — statuts de compte qui occupent une place de
 * l'offre. Un compte suspendu (`SUSPENDED`) la garde : la suspension est
 * réversible, et libérer sa place laisserait l'entreprise inviter quelqu'un
 * d'autre puis dépasser le plafond à la réactivation. Seuls les statuts
 * terminaux la libèrent : `CANCELLED` (exclusion, voir
 * `app/actions/members.ts::excludeMember`) et `EXPIRED`. Il n'existe pas de
 * suppression logique sur `User` — ce filtre de statut en tient lieu.
 */
export const SEAT_OCCUPYING_USER_STATUSES: MembershipStatus[] = [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "SUSPENDED",
];

type SeatCompany = Pick<Company, "id" | "companyAdminId" | "adminParticipates">;
type SeatDb = {
  user: Pick<PrismaClient["user"], "count">;
  companyInvite: Pick<PrismaClient["companyInvite"], "count">;
};

/**
 * Audit (25 septembre 2026) — décompte unique des places occupées, jusqu'ici
 * recalculé différemment à quatre endroits (`inviteTeammate`, la page
 * Gestion — qui ne comptait que les `ACTIVE` et toutes les invitations
 * `PENDING`, même expirées —, et pas du tout dans `resendInvite` ni
 * `acceptCompanyInvite`). Règle : comptes de l'entreprise dans un statut
 * de `SEAT_OCCUPYING_USER_STATUSES` + invitations `PENDING` non expirées ;
 * le gestionnaire n'est compté que s'il a coché « Je participe »
 * (`conception/12` §3.3). `db` accepte un client de transaction.
 */
export async function countUsedSeats(
  company: SeatCompany,
  options: { db?: SeatDb; now?: Date; excludeInviteId?: string } = {}
): Promise<number> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const [memberCount, pendingInviteCount] = await Promise.all([
    db.user.count({
      where: {
        companyId: company.id,
        status: { in: SEAT_OCCUPYING_USER_STATUSES },
        ...(company.adminParticipates || !company.companyAdminId
          ? {}
          : { id: { not: company.companyAdminId } }),
      },
    }),
    // Une invitation expirée jamais acceptée ne doit plus occuper de siège.
    db.companyInvite.count({
      where: {
        companyId: company.id,
        status: "PENDING",
        expiresAt: { gt: now },
        ...(options.excludeInviteId ? { id: { not: options.excludeInviteId } } : {}),
      },
    }),
  ]);
  return memberCount + pendingInviteCount;
}

/**
 * Audit (25 septembre 2026) — les collaborateurs se rassemblent après
 * paiement (BACKLOG_MVP §3) : aucune invitation tant que l'abonnement n'est
 * pas `ACTIVE`. Partagé entre `inviteTeammate`/`resendInvite` et la page
 * Gestion (`app/entreprises/[id]/page.tsx`), qui l'affiche à la place du
 * formulaire d'invitation.
 */
export const INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_MESSAGE =
  "Les invitations s'ouvrent une fois votre paiement validé.";
