import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface CompanyAdminWelcomeEmailProps {
  adminName: string;
  companyName: string;
  planName: string;
  paymentUrl: string;
}

/**
 * Audit (25 septembre 2026) — le gestionnaire qui créait son compte et son
 * entreprise (`createCompanyAccount`, checkout Evolia) ne recevait aucun
 * email : s'il fermait l'onglet avant de payer, rien ne lui rappelait la
 * prochaine étape ni où la reprendre. Envoyé à l'inscription, avant tout
 * paiement — la confirmation de paiement a son propre email
 * (`CompanyPaymentConfirmedEmail`).
 */
export default function CompanyAdminWelcomeEmail({
  adminName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  planName = "Pack Entreprise",
  paymentUrl = "https://app.ceo-summit.mg/entreprise/paiement",
}: CompanyAdminWelcomeEmailProps) {
  return (
    <EmailLayout preview={`Votre compte CEO Summit est créé — ${companyName}`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bienvenue, {adminName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 8px" }}>
        Votre compte gestionnaire et la fiche de <strong>{companyName}</strong> sont créés sur CEO
        Summit, avec l&apos;offre <strong>{planName}</strong>.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Prochaine étape : le paiement. Une fois votre paiement validé par l&apos;équipe CEO Summit,
        vous pourrez inviter vos collaborateurs et composer la liste des participants.
      </Text>
      <a href={paymentUrl} style={emailButtonStyle}>
        Procéder au paiement
      </a>
    </EmailLayout>
  );
}
