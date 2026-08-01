import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface AdminCompanyPaymentAlertEmailProps {
  companyName: string;
  amount: number;
  method: string;
}

const METHOD_LABEL: Record<string, string> = {
  VIREMENT: "virement bancaire",
  CHEQUE: "chèque",
  CARTE_BANCAIRE: "carte bancaire",
  MOBILE_MONEY: "mobile money",
};

/**
 * Phase 2 offres/paiement (30 juillet 2026) — tous les modes de paiement
 * entreprise passent par validation manuelle en V1 (y compris carte
 * bancaire), donc cette alerte est envoyée pour chaque soumission, pas
 * seulement pour le virement (contrairement à AdminEventPaymentAlertEmail).
 */
export default function AdminCompanyPaymentAlertEmail({
  companyName = "Rakoto Holding",
  amount = 5_000_000,
  method = "VIREMENT",
}: AdminCompanyPaymentAlertEmailProps) {
  return (
    <EmailLayout preview={`Paiement entreprise à valider — ${companyName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Paiement entreprise à valider
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 8px" }}>
        <strong>{companyName}</strong> a soumis une preuve de paiement par{" "}
        {METHOD_LABEL[method] ?? method}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Montant déclaré : <strong>{new Intl.NumberFormat("fr-FR").format(amount)} Ar</strong>.
        Vérifier la preuve et valider depuis le back-office (/admin/entreprises).
      </Text>
    </EmailLayout>
  );
}
