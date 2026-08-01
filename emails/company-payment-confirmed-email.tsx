import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface CompanyPaymentConfirmedEmailProps {
  adminName: string;
  companyName: string;
}

/** Phase 2 offres/paiement (30 juillet 2026) — envoyé par confirmCompanyPayment. */
export default function CompanyPaymentConfirmedEmail({
  adminName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
}: CompanyPaymentConfirmedEmailProps) {
  return (
    <EmailLayout preview={`Paiement confirmé — ${companyName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Paiement confirmé, {adminName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Le paiement de <strong>{companyName}</strong> a été validé — l&apos;accès à la plateforme
        est maintenant actif pour vous et tous vos collaborateurs.
      </Text>
    </EmailLayout>
  );
}
