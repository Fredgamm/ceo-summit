import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface EventPaymentReminderEmailProps {
  memberName: string;
  eventTitle: string;
  amount: number;
}

/** E8-T10 — "✉ Relancer" un paiement événement en attente. */
export default function EventPaymentReminderEmail({
  memberName = "Fatima Said",
  eventTitle = "CEO Summit 2026 — La Réunion",
  amount = 1_500_000,
}: EventPaymentReminderEmailProps) {
  return (
    <EmailLayout preview={`Paiement en attente — ${eventTitle}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Paiement en attente — {eventTitle}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, nous n&apos;avons pas encore reçu confirmation de votre
        paiement de <strong>{new Intl.NumberFormat("fr-FR").format(amount)} Ar</strong> pour{" "}
        <strong>{eventTitle}</strong>. Votre badge sera activé dès réception. Merci de vérifier que
        votre virement ou paiement mobile a bien été initié.
      </Text>
    </EmailLayout>
  );
}
