"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { serviceFormSchema } from "@/lib/validations/service";
import { sendTransactionalEmail } from "@/lib/resend";
import AdminServiceListingAlertEmail from "@/emails/admin-service-listing-alert-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const ACTIVE_STATUSES = ["PENDING_MODERATION", "PUBLISHED"] as const;

/**
 * E5-T03 — dépôt de fiche service, statut pending_moderation → email admin.
 * "Limit : 1 fiche active par entreprise (Member/Executive), illimité Chairman."
 */
export async function submitServiceListing(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) return { success: false, error: "Non authentifié." };

  const isChairman = getViewerTierFromCompany(viewer.company) === "CHAIRMAN";

  if (!isChairman) {
    const existingActive = await prisma.serviceListing.findFirst({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        ...(viewer.companyId ? { companyId: viewer.companyId } : { authorId: viewer.id }),
      },
    });
    if (existingActive) {
      return {
        success: false,
        error:
          "Vous avez déjà une fiche active (en attente ou publiée) — un seul dépôt à la fois pour votre entreprise.",
      };
    }
  }

  const listing = await prisma.serviceListing.create({
    data: {
      authorId: viewer.id,
      companyId: viewer.companyId,
      category: f.category,
      title: f.title,
      description: f.description,
      priceInfo: f.priceInfo.trim() || null,
      gallery: f.gallery,
      status: "PENDING_MODERATION",
    },
  });

  if (process.env.ADMIN_ALERT_EMAIL) {
    await sendTransactionalEmail({
      to: process.env.ADMIN_ALERT_EMAIL,
      subject: `Nouvelle fiche service à modérer — ${listing.title}`,
      react: AdminServiceListingAlertEmail({
        authorName: viewer.name,
        serviceTitle: listing.title,
      }),
    });
  }

  revalidatePath("/catalogue/services");
  return { success: true, data: { id: listing.id } };
}
