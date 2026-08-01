import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface AdminMembershipPaymentAlertEmailProps {
  memberName: string;
  amount: number;
  method: string;
}

const METHOD_LABEL: Record<string, string> = {
  VIREMENT: "virement bancaire",
  CHEQUE: "chèque",
  CARTE_BANCAIRE: "carte bancaire",
  MOBILE_MONEY: "mobile money",
};

/** Phase 2ter (1er août 2026) — miroir d'AdminCompanyPaymentAlertEmail pour les adhésions individuelles. */
export default function AdminMembershipPaymentAlertEmail({
  memberName = "Jean-Pierre Rakoto",
  amount = 2_500_000,
  method = "VIREMENT",
}: AdminMembershipPaymentAlertEmailProps) {
  return (
    <EmailLayout preview={`Adhésion à valider — ${memberName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Adhésion individuelle à valider
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 8px" }}>
        <strong>{memberName}</strong> a soumis une preuve de paiement par{" "}
        {METHOD_LABEL[method] ?? method}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Montant déclaré : <strong>{new Intl.NumberFormat("fr-FR").format(amount)} Ar</strong>.
        Vérifier la preuve et valider depuis le back-office (/admin/adhesions).
      </Text>
    </EmailLayout>
  );
}
