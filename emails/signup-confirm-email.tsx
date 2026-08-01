import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface SignupConfirmEmailProps {
  memberName: string;
  activationUrl: string;
}

/**
 * Phase 2 offres/paiement (30 juillet 2026) — envoyé par app/actions/auth.ts::signup,
 * l'inscription self-service. Distinct d'ActivationEmail (qui parle d'un
 * paiement déjà confirmé) : ici, rien n'a encore été payé, la copie ne doit
 * pas le laisser croire.
 */
export default function SignupConfirmEmail({
  memberName = "Jean-Pierre Rakoto",
  activationUrl = "https://app.ceosummit.mg/activer/token",
}: SignupConfirmEmailProps) {
  return (
    <EmailLayout preview="Confirmez votre inscription CEO Summit">
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bienvenue, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Merci de vous être inscrit sur CEO Summit. Confirmez votre email et choisissez votre mot de
        passe pour accéder à votre espace personnel — vous pourrez ensuite créer votre fiche
        entreprise et choisir une offre.
      </Text>
      <a href={activationUrl} style={emailButtonStyle}>
        Confirmer mon inscription
      </a>
      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        Ce lien est valable 72 heures. Passé ce délai, vous pourrez en demander un nouveau depuis la
        page de connexion.
      </Text>
    </EmailLayout>
  );
}
