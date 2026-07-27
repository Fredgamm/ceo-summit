import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface ActivationEmailProps {
  memberName: string;
  tier: string;
  activationUrl: string;
}

/**
 * Sent by the Evolia webhook (E1-T02) right after a payment is confirmed.
 * Ref: phase1_evolia_membres.md UC-P1-01 — "Envoi de l'email d'activation au membre"
 * Link expires in 72h (ActivationToken.expiresAt).
 */
export default function ActivationEmail({
  memberName = "Jean-Pierre Rakoto",
  tier = "Executive",
  activationUrl = "https://app.ceosummit.mg/activer/token",
}: ActivationEmailProps) {
  return (
    <EmailLayout preview={`Votre accès CEO Summit ${tier} est prêt — activez votre compte`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bienvenue, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre paiement a été confirmé et votre place au sein du cercle CEO Summit — membership{" "}
        <strong>{tier}</strong> — est réservée. Il ne reste qu&apos;une étape avant d&apos;accéder à
        la Deal Room, aux événements et aux salles thématiques réservées aux membres.
      </Text>
      <a href={activationUrl} style={emailButtonStyle}>
        Activer mon compte
      </a>
      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        Ce lien est valable 72 heures. Passé ce délai, vous pourrez en demander un nouveau
        depuis la page de connexion.
      </Text>
    </EmailLayout>
  );
}
