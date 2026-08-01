import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface CompanyInviteEmailProps {
  inviteeName: string;
  companyName: string;
  inviteUrl: string;
}

/** Phase 2 offres/paiement (30 juillet 2026) — envoyé par inviteTeammate. */
export default function CompanyInviteEmail({
  inviteeName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  inviteUrl = "https://app.ceosummit.mg/invitation/token",
}: CompanyInviteEmailProps) {
  return (
    <EmailLayout preview={`${companyName} vous invite à rejoindre CEO Summit`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bonjour {inviteeName.split(" ")[0]},
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        <strong>{companyName}</strong> vous invite à rejoindre son équipe sur CEO Summit. Acceptez
        l&apos;invitation pour créer votre compte et accéder à la plateforme.
      </Text>
      <a href={inviteUrl} style={emailButtonStyle}>
        Accepter l&apos;invitation
      </a>
    </EmailLayout>
  );
}
