import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";
import { formatAriary } from "@/lib/utils";

interface AdminCreditPurchaseAlertEmailProps {
  memberName: string;
  credits: number;
  amount: number;
}

/** E6-T05 — notification admin pour valider manuellement un achat de crédits. */
export default function AdminCreditPurchaseAlertEmail({
  memberName = "Jean-Pierre Rakoto",
  credits = 5,
  amount = 100000,
}: AdminCreditPurchaseAlertEmailProps) {
  return (
    <EmailLayout preview={`Achat de crédits à valider — ${memberName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Achat de crédits à valider
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        <strong>{memberName}</strong> a demandé un pack de <strong>{credits} crédits</strong> (
        {formatAriary(amount)}). Valider la réception du paiement depuis le back-office.
      </Text>
    </EmailLayout>
  );
}
