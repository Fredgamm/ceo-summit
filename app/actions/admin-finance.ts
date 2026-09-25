"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmEventRegistrationPaymentCore } from "@/lib/payment-confirmations";
import { sendTransactionalEmail } from "@/lib/resend";
import { resolveEmail } from "@/lib/email-template-resolver";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E8-T10 — "Liste paiements ... + validation manuelle virements". Débloque
 * un vrai cul-de-sac : une inscription payée par virement/mobile money
 * restait en PENDING pour toujours, aucune action admin n'existait pour la
 * confirmer (seul un email d'alerte était envoyé à la soumission, E3-T03).
 *
 * requireAdmin puis délègue à `confirmEventRegistrationPaymentCore`
 * (lib/payment-confirmations.ts), partagée avec le webhook paiement
 * générique (7 août 2026).
 */
export async function confirmEventPayment(registrationId: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("finances");
  const result = await confirmEventRegistrationPaymentCore(registrationId, adminId);
  if (result.success) revalidatePath("/admin/finances");
  return result;
}

export async function sendEventPaymentReminder(registrationId: string): Promise<ActionResult> {
  await requireAdmin("finances");

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: { user: true, event: true },
  });
  if (!registration) return { success: false, error: "Inscription introuvable." };

  try {
    const email = await resolveEmail("event-payment-reminder", {
      memberName: registration.user.name,
      eventTitle: registration.event.title,
      amount: `${new Intl.NumberFormat("fr-FR").format(registration.event.price)} Ar`,
    });
    if (email) await sendTransactionalEmail({ to: registration.user.email, ...email });
  } catch (err) {
    console.error("[sendEventPaymentReminder] failed to send reminder email", err);
    return { success: false, error: "Échec de l'envoi de l'email. Réessayez plus tard." };
  }

  return { success: true, data: undefined };
}
