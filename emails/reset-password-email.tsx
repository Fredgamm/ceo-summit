import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface ResetPasswordEmailProps {
  memberName: string;
  resetUrl: string;
}

/** Link expires in 1h (PasswordResetToken.expiresAt) — E1-T06. */
export default function ResetPasswordEmail({
  memberName = "Jean-Pierre Rakoto",
  resetUrl = "https://app.ceosummit.mg/reinitialiser/token",
}: ResetPasswordEmailProps) {
  return (
    <EmailLayout preview="Réinitialisez votre mot de passe CEO Summit">
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Réinitialisation du mot de passe
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, vous avez demandé la réinitialisation de votre mot
        de passe CEO Summit. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
      </Text>
      <a href={resetUrl} style={emailButtonStyle}>
        Réinitialiser mon mot de passe
      </a>
      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        Ce lien est valable 1 heure. Si vous n&apos;êtes pas à l&apos;origine de cette demande,
        ignorez simplement cet email — votre mot de passe actuel reste inchangé.
      </Text>
    </EmailLayout>
  );
}
