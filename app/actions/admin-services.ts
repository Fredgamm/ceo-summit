"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { sendTransactionalEmail } from "@/lib/resend";
import ServiceListingApprovedEmail from "@/emails/service-listing-approved-email";
import ServiceListingRefusedEmail from "@/emails/service-listing-refused-email";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/** E5-T03 — "Modération admin avant publication". */
export async function approveServiceListing(listingId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("services");

  const listing = await prisma.serviceListing.findUnique({
    where: { id: listingId },
    include: { author: { select: { email: true } } },
  });
  if (!listing) return { success: false, error: "Fiche introuvable." };
  if (listing.status !== "PENDING_MODERATION") {
    return { success: false, error: "Cette fiche a déjà été traitée." };
  }

  await prisma.serviceListing.update({ where: { id: listingId }, data: { status: "PUBLISHED" } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "service.approve",
      targetType: "ServiceListing",
      targetId: listingId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: listing.author.email,
      subject: `Votre fiche "${listing.title}" est publiée`,
      react: ServiceListingApprovedEmail({
        serviceTitle: listing.title,
        serviceUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/catalogue/services/${listingId}`,
      }),
    });
  } catch (err) {
    // La publication et l'audit log sont déjà commités à ce stade — un
    // échec d'envoi ne doit pas faire échouer l'approbation (audit du 7
    // août, "pattern try/catch email admin appliqué de façon inégale").
    console.error("[approveServiceListing] failed to send approval email", err);
  }

  revalidatePath("/admin/catalogue-services");
  revalidatePath("/catalogue/services");
  return { success: true, data: undefined };
}

export async function rejectServiceListing(listingId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("services");

  const listing = await prisma.serviceListing.findUnique({
    where: { id: listingId },
    include: { author: { select: { email: true } } },
  });
  if (!listing) return { success: false, error: "Fiche introuvable." };
  if (listing.status !== "PENDING_MODERATION") {
    return { success: false, error: "Cette fiche a déjà été traitée." };
  }

  await prisma.serviceListing.update({ where: { id: listingId }, data: { status: "REFUSED" } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "service.reject",
      targetType: "ServiceListing",
      targetId: listingId,
    },
  });

  try {
    await sendTransactionalEmail({
      to: listing.author.email,
      subject: `Votre fiche "${listing.title}" n'a pas été retenue`,
      react: ServiceListingRefusedEmail({ serviceTitle: listing.title }),
    });
  } catch (err) {
    console.error("[rejectServiceListing] failed to send refusal email", err);
  }

  revalidatePath("/admin/catalogue-services");
  return { success: true, data: undefined };
}
