import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface MemberExcludedEmailProps {
  memberName: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — jusqu'ici, un
 * membre exclu le découvrait uniquement en échouant à se connecter, aucune
 * notification n'était envoyée. Voir app/actions/members.ts.
 */
export default function MemberExcludedEmail({
  memberName = "Jean-Pierre Rakoto",
}: MemberExcludedEmailProps) {
  return (
    <EmailLayout preview="Votre compte CEO Summit a été résilié">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Compte résilié
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, votre compte CEO Summit a été résilié par l&apos;équipe
        d&apos;administration. L&apos;accès à la plateforme n&apos;est plus disponible. Pour toute
        question, contactez l&apos;équipe CEO Summit.
      </Text>
    </EmailLayout>
  );
}
