"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { canManageCompany } from "@/lib/staff-organization";
import { requireViewer } from "@/lib/require-viewer";
import { isPartnerOffer, partnershipEndDate } from "@/lib/partner-offers";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * 14 oct. 2026 — un administrateur de la plateforme n'achète rien, mais
 * inscrit son staff aux événements pour leurs badges Evolia. Son
 * organisation reçoit directement, sans paiement, une offre « Staff » : une
 * offre partenaire (module 20, offre à 0 non proposée à l'inscription) liée
 * à l'événement. La liste des participants et l'envoi à Evolia reprennent
 * ensuite le parcours habituel (app/actions/company-participants.ts,
 * `ensurePaymentlessRegistration` dans lib/evolia.ts).
 */
export async function activateStaffOffer(companyId: string, planId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (!viewer.isPlatformAdmin) {
    return { success: false, error: "Réservé aux administrateurs de la plateforme." };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { subscription: true },
  });
  if (!company) return { success: false, error: "Organisation introuvable." };
  if (!(await canManageCompany(viewer, company))) {
    return {
      success: false,
      error: "Seul le gérant de cette organisation peut choisir son offre.",
    };
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { event: { select: { date: true } } },
  });
  if (!plan || !isPartnerOffer(plan) || !plan.event || plan.event.date < new Date()) {
    return {
      success: false,
      error: "Choisissez une offre gratuite rattachée à un événement à venir.",
    };
  }
  if (
    company.subscription?.planId === plan.id &&
    company.subscription.status === "ACTIVE" &&
    company.subscription.unlimitedSeats
  ) {
    return { success: true, data: undefined };
  }

  const now = new Date();
  const fields = {
    planId: plan.id,
    status: "ACTIVE" as const,
    startDate: now,
    endDate: partnershipEndDate(now),
    declaredParticipants: null,
    extraSeats: 0,
    memberLimit: null,
    // Le staff de CEO Summit n'a pas de plafond de places.
    unlimitedSeats: true,
    participantsValidatedAt: null,
  };
  await prisma.$transaction([
    prisma.companySubscription.upsert({
      where: { companyId },
      update: fields,
      create: { companyId, ...fields },
    }),
    prisma.auditLog.create({
      data: {
        actorId: viewer.id,
        action: "company.staff_offer.activate",
        targetType: "Company",
        targetId: companyId,
        metadata: { planId: plan.id, previousPlanId: company.subscription?.planId ?? null },
      },
    }),
  ]);

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
