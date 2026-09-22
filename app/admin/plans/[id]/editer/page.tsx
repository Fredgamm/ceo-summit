import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getPlanShareUrl } from "@/lib/plan-share";
import { PlanForm } from "@/components/admin/plans/plan-form";
import { PlanShareButton } from "@/components/admin/plans/plan-share-button";

export const metadata: Metadata = { title: "Admin — Éditer une offre" };

export default async function EditPlanPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("plans");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan) notFound();

  const shareUrl = plan.isActive && plan.isSelfService ? getPlanShareUrl(plan.slug) : null;
  const qrCodeDataUrl = shareUrl
    ? await QRCode.toDataURL(shareUrl, { width: 180, margin: 1 })
    : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Éditer {plan.name}</h1>
        {shareUrl && qrCodeDataUrl && (
          <PlanShareButton url={shareUrl} qrCodeDataUrl={qrCodeDataUrl} />
        )}
      </div>
      <PlanForm
        mode="edit"
        planId={plan.id}
        initialValues={{
          name: plan.name,
          slug: plan.slug,
          description: plan.description ?? "",
          pricingMode: plan.pricingMode ?? "FIXED_BUNDLE",
          priceAr: plan.priceAr,
          priceEur: plan.priceEur,
          minParticipants: plan.minParticipants,
          maxTeamMembers: plan.maxTeamMembers,
          eligibilityNote: plan.eligibilityNote ?? "",
          isActive: plan.isActive,
          isSelfService: plan.isSelfService,
          displayOrder: plan.displayOrder,
        }}
      />
    </div>
  );
}
