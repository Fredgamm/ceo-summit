import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface AdminEventPaymentAlertEmailProps {
  memberName: string;
  memberEmail: string;
  eventTitle: string;
  amount: number;
}

/**
 * E3-T03 — "Notification admin si paiement par virement (validation manuelle)".
 * Bank transfers have no automated confirmation, unlike Evolia for
 * memberships, so an admin has to manually mark the registration paid.
 */
export default function AdminEventPaymentAlertEmail({
  memberName = "Jean-Pierre Rakoto",
  memberEmail = "jp.rakoto@techocean.mg",
  eventTitle = "CEO Summit 2026 — La Réunion",
  amount = 1500000,
}: AdminEventPaymentAlertEmailProps) {
  return (
    <EmailLayout preview={`Virement à valider — ${eventTitle}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Virement à valider manuellement
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 8px" }}>
        <strong>{memberName}</strong> ({memberEmail}) s&apos;est inscrit(e) à{" "}
        <strong>{eventTitle}</strong> et a choisi le paiement par virement bancaire.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Montant attendu : <strong>{new Intl.NumberFormat("fr-FR").format(amount)} Ar</strong>.
        Valider la réception depuis le back-office une fois le virement confirmé.
      </Text>
    </EmailLayout>
  );
}
