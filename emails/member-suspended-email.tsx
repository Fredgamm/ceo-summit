import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface MemberSuspendedEmailProps {
  memberName: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — jusqu'ici, un
 * membre suspendu le découvrait uniquement en échouant à se connecter,
 * aucune notification n'était envoyée. Voir app/actions/members.ts.
 */
export default function MemberSuspendedEmail({
  memberName = "Jean-Pierre Rakoto",
}: MemberSuspendedEmailProps) {
  return (
    <EmailLayout preview="Votre compte CEO Summit a été suspendu">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Compte suspendu
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, votre compte CEO Summit a été suspendu par l&apos;équipe
        d&apos;administration. L&apos;accès à la plateforme est temporairement indisponible. Pour
        toute question, contactez l&apos;équipe CEO Summit.
      </Text>
    </EmailLayout>
  );
}
