"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import { isPublicObjectUrlUnderPrefix } from "@/lib/r2";
import { requireViewer } from "@/lib/require-viewer";
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
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  /**
   * Audit sécurité (25 septembre 2026) — `gallery` venait tel quel du
   * client : n'importe quelle URL (externe, ou objet d'un autre membre)
   * était publiée comme visuel. `/api/services/gallery` range toujours ses
   * images sous `services/<uploaderId>/` dans le bucket documents — seules
   * ces URLs-là, pour l'appelant courant, sont désormais acceptées.
   */
  const galleryBucket = process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents";
  if (
    !f.gallery.every((url) =>
      isPublicObjectUrlUnderPrefix(url, galleryBucket, `services/${viewer.id}/`)
    )
  ) {
    return { success: false, error: "Visuel invalide." };
  }

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
    try {
      await sendTransactionalEmail({
        to: process.env.ADMIN_ALERT_EMAIL,
        subject: `Nouvelle fiche service à modérer — ${listing.title}`,
        react: AdminServiceListingAlertEmail({
          authorName: viewer.name,
          serviceTitle: listing.title,
        }),
      });
    } catch (err) {
      // La fiche est déjà créée à ce stade — un échec d'envoi de l'alerte
      // admin ne doit pas faire échouer le dépôt (même bug de classe que
      // celui corrigé sur signup() le 1er août 2026).
      console.error("[createServiceListing] failed to send admin alert email", err);
    }
  }

  revalidatePath("/catalogue/services");
  return { success: true, data: { id: listing.id } };
}
