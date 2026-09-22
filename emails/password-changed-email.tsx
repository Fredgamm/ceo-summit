import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface PasswordChangedEmailProps {
  memberName: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — bonne pratique
 * sécurité standard absente jusqu'ici : sans cette confirmation, une prise
 * de contrôle de compte via reinitialiser/[token] passait inaperçue pour le
 * titulaire légitime. Voir app/actions/auth.ts::resetPassword.
 */
export default function PasswordChangedEmail({
  memberName = "Jean-Pierre Rakoto",
}: PasswordChangedEmailProps) {
  return (
    <EmailLayout preview="Votre mot de passe CEO Summit a été modifié">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Mot de passe modifié
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, le mot de passe de votre compte CEO Summit vient
        d&apos;être modifié. Si vous n&apos;êtes pas à l&apos;origine de ce changement, contactez
        immédiatement l&apos;équipe CEO Summit.
      </Text>
    </EmailLayout>
  );
}
