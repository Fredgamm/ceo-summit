import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface CompanyPaymentRejectedEmailProps {
  adminName: string;
  companyName: string;
  reason: string;
}

/**
 * Phase 2 offres/paiement (30 juillet 2026) — envoyé par
 * rejectCompanyPayment. Contrairement au motif de refus de candidature
 * (RG-07, jamais envoyé), le motif ici est communiqué directement : c'est
 * une information opérationnelle dont l'admin entreprise a besoin pour
 * corriger et ressoumettre, pas une décision RH sensible.
 */
export default function CompanyPaymentRejectedEmail({
  adminName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  reason = "Preuve illisible",
}: CompanyPaymentRejectedEmailProps) {
  return (
    <EmailLayout preview={`Paiement à corriger — ${companyName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Un correctif est nécessaire, {adminName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 8px" }}>
        Le paiement soumis pour participation au CEO Summit Indian Ocean, 3rd edition n&apos;a pas
        pu être validé :
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: emailColors.navy,
          fontStyle: "italic",
          margin: "0 0 16px",
          padding: "10px 14px",
          background: "#F7F7F5",
          borderRadius: 6,
        }}
      >
        {reason}
      </Text>
      <a href="https://app.ceo-summit.mg/entreprise/paiement" style={emailButtonStyle}>
        Soumettre à nouveau
      </a>
    </EmailLayout>
  );
}
