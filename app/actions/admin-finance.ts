"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmEventRegistrationPaymentCore } from "@/lib/payment-confirmations";
import { sendTransactionalEmail } from "@/lib/resend";
import EventPaymentReminderEmail from "@/emails/event-payment-reminder-email";

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

  // Contrairement aux autres correctifs de ce lot (audit du 7 août, "pattern
  // try/catch email admin appliqué de façon inégale") : ici il n'y a aucune
  // écriture préalable à protéger — l'envoi de cet email EST l'action.
  // Un échec doit donc être rapporté à l'appelant ({success:false}), pas
  // avalé comme un effet de bord secondaire.
  try {
    await sendTransactionalEmail({
      to: registration.user.email,
      subject: `Paiement en attente — ${registration.event.title}`,
      react: EventPaymentReminderEmail({
        memberName: registration.user.name,
        eventTitle: registration.event.title,
        amount: registration.event.price,
      }),
    });
  } catch (err) {
    console.error("[sendEventPaymentReminder] failed to send reminder email", err);
    return { success: false, error: "L'envoi de la relance a échoué. Réessayez." };
  }

  return { success: true, data: undefined };
}
