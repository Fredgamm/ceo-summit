"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { planFormSchema } from "@/lib/validations/plan";
import { convertEurToAr } from "@/lib/currency-conversion";
import { cleanPlanName } from "@/lib/plans-query";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 1 offres dynamiques (30 juillet 2026) — "offres créables librement
 * par l'admin", remplace à terme l'enum `Tier`. Même forme que
 * app/actions/admin-rooms.ts : requireAdmin -> Zod -> Prisma -> auditLog ->
 * revalidatePath.
 */

/**
 * 3 septembre 2026 — une offre cotée en euros voit son `priceAr` recalculé
 * côté serveur au taux du jour à chaque création/modification (jamais une
 * valeur envoyée par le client) ; `priceAr` reste la seule valeur lue pour
 * tout calcul de montant dû, `priceEur` n'est qu'informatif à l'affichage.
 *
 * Audit MVP (25 septembre 2026) :
 * - un `priceEur` à 0 est un prix en euros comme un autre : il donne un
 *   `priceAr` converti côté serveur (0), au lieu de retomber sur le
 *   `priceAr` envoyé par le client sans contrôle ;
 * - les champs sans effet dans le mode choisi sont remis à `null` (seuil
 *   minimum en forfait fixe, nombre de places en offre groupement — le
 *   quota d'une offre groupement est l'effectif déclaré, voir
 *   `lib/company-seats.ts::seatCap`, qui ne lit `maxTeamMembers` qu'en
 *   `FIXED_BUNDLE`) ;
 * - les astérisques de mise en forme markdown saisis dans le nom sont
 *   retirés (« Early Bird** (fin : 31 déc 2026) » en production).
 */
async function toPlanData(f: ReturnType<typeof planFormSchema.parse>) {
  const hasEurPrice = f.priceEur !== null && f.priceEur !== undefined;
  const priceAr = hasEurPrice ? await convertEurToAr(f.priceEur as number) : f.priceAr;
  const isGroup = f.pricingMode === "PER_PARTICIPANT";
  return {
    name: cleanPlanName(f.name),
    slug: f.slug,
    description: f.description || null,
    priceAr,
    priceEur: hasEurPrice ? f.priceEur : null,
    pricingMode: f.pricingMode,
    maxTeamMembers: isGroup ? null : (f.maxTeamMembers ?? null),
    minParticipants: isGroup ? (f.minParticipants ?? null) : null,
    eligibilityNote: f.eligibilityNote || null,
    isActive: f.isActive,
    isSelfService: f.isSelfService,
    isUpsell: f.isUpsell,
    displayOrder: f.displayOrder,
    /**
     * 22 septembre 2026 (`conception/12` §2.5) — `rank` ne compare plus
     * aucun accès depuis que tout membre payé a les mêmes droits : la
     * colonne reste (non nullable, encore lue par `nearestLegacyTier`) mais
     * n'est plus demandée à l'admin, elle suit simplement l'ordre
     * d'affichage.
     */
    rank: f.displayOrder + 1,
  };
}

export async function createPlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { userId: adminId } = await requireAdmin("plans");

  const parsed = planFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const existingSlug = await prisma.plan.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug) {
    return { success: false, error: "Ce slug est déjà utilisé par une autre offre." };
  }

  const plan = await prisma.plan.create({ data: await toPlanData(parsed.data) });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.create", targetType: "Plan", targetId: plan.id },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: { id: plan.id } };
}

export async function updatePlan(planId: string, input: unknown): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  const parsed = planFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const existingSlug = await prisma.plan.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug && existingSlug.id !== planId) {
    return { success: false, error: "Ce slug est déjà utilisé par une autre offre." };
  }

  await prisma.plan.update({ where: { id: planId }, data: await toPlanData(parsed.data) });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.update", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  revalidatePath(`/admin/plans/${planId}/editer`);
  return { success: true, data: undefined };
}

export async function togglePlanActive(planId: string, isActive: boolean): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  await prisma.plan.update({ where: { id: planId }, data: { isActive } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: isActive ? "plan.activate" : "plan.deactivate",
      targetType: "Plan",
      targetId: planId,
    },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: undefined };
}

/**
 * Suppression bloquée si le plan est référencé par une offre d'évènement
 * qui en hérite les avantages (RG-13, 4 août 2026) — même logique
 * "archiver, pas détruire" que archiveRoom : on propose de désactiver
 * (togglePlanActive) plutôt que de casser des FK.
 *
 * Correctif (7 août 2026, audit) — cette fonction vérifiait aussi
 * `User.planId`, une colonne jamais écrite depuis la bascule Tier->Plan
 * (4 août 2026, voir prisma/schema.prisma) et supprimée dans ce même
 * correctif : ce volet de la garde ne bloquait donc jamais rien en
 * pratique (toujours 0), seul `linkedPlatformPlanId` reste un vrai risque.
 *
 * Audit MVP (25 septembre 2026) — bloquée aussi si une entreprise est (ou a
 * été) abonnée à l'offre, ou l'a achetée en supplément : la suppression
 * casserait la clé étrangère (erreur brute) et effacerait l'historique
 * financier. Même réponse : désactiver plutôt que supprimer.
 */
export async function deletePlan(planId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  const linkedOffersCount = await prisma.plan.count({ where: { linkedPlatformPlanId: planId } });
  if (linkedOffersCount > 0) {
    return {
      success: false,
      error: `Ce plan est utilisé par ${linkedOffersCount} offre(s) d'évènement — désactive-le au lieu de le supprimer.`,
    };
  }

  const [subscriptionsCount, upsellPaymentsCount] = await Promise.all([
    prisma.companySubscription.count({ where: { planId } }),
    prisma.companyPayment.count({ where: { upsellPlanId: planId } }),
  ]);
  if (subscriptionsCount > 0 || upsellPaymentsCount > 0) {
    const uses = [
      subscriptionsCount > 0 ? `${subscriptionsCount} abonnement(s) d'entreprise` : null,
      upsellPaymentsCount > 0 ? `${upsellPaymentsCount} achat(s) en supplément` : null,
    ]
      .filter(Boolean)
      .join(" et ");
    return {
      success: false,
      error: `Cette offre est liée à ${uses} — désactive-la au lieu de la supprimer, l'historique des paiements est conservé.`,
    };
  }

  await prisma.plan.delete({ where: { id: planId } });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.delete", targetType: "Plan", targetId: planId },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: undefined };
}

/** Réordonnancement en masse depuis un drag-and-drop de la liste admin. */
export async function reorderPlans(orderedIds: string[]): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("plans");

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.plan.update({ where: { id }, data: { displayOrder: index } })
    )
  );
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "plan.reorder", targetType: "Plan", targetId: "bulk" },
  });

  revalidatePath("/admin/plans");
  return { success: true, data: undefined };
}
