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

/**
 * E5-T03 — dépôt de fiche service, statut pending_moderation → email admin.
 *
 * Rapport QA du 1er oct. 2026 (§2.5) — la limite historique "1 fiche active
 * par entreprise (Member/Executive), illimité Chairman" est retirée : le
 * client a confirmé qu'une entreprise peut avoir plusieurs services actifs,
 * quel que soit son tier.
 */
export async function submitServiceListing(input: unknown): Promise<ActionResult<{ id: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  // Une fiche est publiée au nom de l'entreprise : seul son gérant peut en
  // déposer une, et seulement une fois l'offre de l'entreprise active.
  if (!viewer.company || viewer.company.companyAdminId !== viewer.id) {
    return { success: false, error: "Seul le gérant de l'entreprise peut publier un service." };
  }
  if (getViewerTierFromCompany(viewer.company) === null) {
    return {
      success: false,
      error: "Votre entreprise doit avoir une offre active pour publier un service.",
    };
  }

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

/**
 * Rapport QA du 1er oct. 2026 (§2.5) — édition d'une fiche déjà déposée,
 * depuis l'onglet "Services" de la fiche entreprise. Autorisé à l'auteur
 * original ou au gérant actuel de l'entreprise (comme `updateCompany`) —
 * pas seulement l'auteur, au cas où il aurait quitté l'entreprise depuis.
 * Repasse en `PENDING_MODERATION` : un contenu modifié doit être revu avant
 * de redevenir visible, même s'il était déjà `PUBLISHED` (même logique que
 * `resubmitOpportunity` pour le Deal Room).
 */
export async function updateServiceListing(
  serviceId: string,
  input: unknown
): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const listing = await prisma.serviceListing.findUnique({
    where: { id: serviceId },
    include: { company: { select: { companyAdminId: true } } },
  });
  if (!listing) return { success: false, error: "Fiche introuvable." };
  const canEdit = listing.authorId === viewer.id || listing.company?.companyAdminId === viewer.id;
  if (!canEdit) {
    return { success: false, error: "Vous ne pouvez pas modifier cette fiche." };
  }

  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  const galleryBucket = process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents";
  if (
    !f.gallery.every(
      (url) =>
        isPublicObjectUrlUnderPrefix(url, galleryBucket, `services/${viewer.id}/`) ||
        isPublicObjectUrlUnderPrefix(url, galleryBucket, `services/${listing.authorId}/`)
    )
  ) {
    return { success: false, error: "Visuel invalide." };
  }

  await prisma.serviceListing.update({
    where: { id: serviceId },
    data: {
      category: f.category,
      title: f.title,
      description: f.description,
      priceInfo: f.priceInfo.trim() || null,
      gallery: f.gallery,
      status: "PENDING_MODERATION",
    },
  });

  if (listing.companyId) revalidatePath(`/entreprises/${listing.companyId}`);
  revalidatePath("/catalogue/services");
  revalidatePath(`/catalogue/services/${serviceId}`);
  return { success: true, data: undefined };
}

/**
 * Rapport QA du 1er oct. 2026 (§2.5) — suppression d'une fiche depuis
 * l'onglet "Services". Pas de statut "archivé" dans le schéma : suppression
 * réelle plutôt qu'un soft-delete à construire pour ce seul besoin.
 */
export async function deleteServiceListing(serviceId: string): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const listing = await prisma.serviceListing.findUnique({
    where: { id: serviceId },
    include: { company: { select: { companyAdminId: true } } },
  });
  if (!listing) return { success: false, error: "Fiche introuvable." };
  const canDelete = listing.authorId === viewer.id || listing.company?.companyAdminId === viewer.id;
  if (!canDelete) {
    return { success: false, error: "Vous ne pouvez pas supprimer cette fiche." };
  }

  await prisma.serviceListing.delete({ where: { id: serviceId } });

  if (listing.companyId) revalidatePath(`/entreprises/${listing.companyId}`);
  revalidatePath("/catalogue/services");
  return { success: true, data: undefined };
}
