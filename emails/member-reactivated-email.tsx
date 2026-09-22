import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface MemberReactivatedEmailProps {
  memberName: string;
  loginUrl: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — pendant du
 * MemberSuspendedEmail/MemberExcludedEmail : confirme la réactivation, sans
 * quoi le membre n'a aucun moyen de savoir que son accès est revenu.
 */
export default function MemberReactivatedEmail({
  memberName = "Jean-Pierre Rakoto",
  loginUrl = "https://app.ceo-summit.mg/login",
}: MemberReactivatedEmailProps) {
  return (
    <EmailLayout preview="Votre compte CEO Summit a été réactivé">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Compte réactivé
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, votre compte CEO Summit a été réactivé — vous pouvez de
        nouveau accéder à la plateforme.
      </Text>
      <a href={loginUrl} style={emailButtonStyle}>
        Me connecter
      </a>
    </EmailLayout>
  );
}
