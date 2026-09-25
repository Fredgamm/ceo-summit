import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";
import { ACTIVATION_TOKEN_TTL_MS } from "@/lib/tokens";

const ACTIVATION_VALIDITY_HOURS = Math.round(ACTIVATION_TOKEN_TTL_MS / (60 * 60 * 1000));

interface ActivationEmailProps {
  memberName: string;
  tier: string;
  activationUrl: string;
}

/**
 * Email d'activation de compte — envoyé quand l'admin approuve une
 * candidature (`app/actions/candidatures.ts::approveApplication`, qui crée le
 * compte en PENDING_ACTIVATION) et renvoyé à la demande depuis la page de
 * connexion (`app/actions/auth.ts::resendActivationLink`). Aucun paiement
 * n'est en jeu à ce stade (correctif audit MVP, 25 septembre 2026 : le texte
 * parlait d'un « paiement confirmé » hérité du premier flux Evolia).
 * Lien valable `ACTIVATION_TOKEN_TTL_MS` (72 h, ActivationToken.expiresAt).
 */
export default function ActivationEmail({
  memberName = "Jean-Pierre Rakoto",
  tier = "Executive",
  activationUrl = "https://app.ceo-summit.mg/activer/token",
}: ActivationEmailProps) {
  return (
    <EmailLayout preview={`Votre accès CEO Summit ${tier} est prêt — activez votre compte`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bienvenue, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre candidature a été acceptée et votre compte CEO Summit — membership{" "}
        <strong>{tier}</strong> — est créé. Il ne reste qu&apos;une étape : choisir votre mot de
        passe pour accéder à la Deal Room, aux événements et aux salles thématiques réservées aux
        membres.
      </Text>
      <a href={activationUrl} style={emailButtonStyle}>
        Activer mon compte
      </a>
      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        Ce lien est valable {ACTIVATION_VALIDITY_HOURS} heures. Passé ce délai, vous pourrez en
        demander un nouveau depuis la page de connexion.
      </Text>
    </EmailLayout>
  );
}
