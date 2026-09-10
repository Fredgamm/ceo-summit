import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface OpportunityContactRequestEmailProps {
  initiatorName: string;
  opportunityTitle: string;
  opportunityUrl: string;
}

/**
 * E7-T04 — sans cet email, l'auteur d'une opportunité n'aurait aucune façon
 * de savoir qu'une demande de contact attend sa décision (accepter →
 * création automatique de la conversation / refuser).
 */
export default function OpportunityContactRequestEmail({
  initiatorName = "Jean-Pierre Rakoto",
  opportunityTitle = "Partenariat distribution solaire — Nord Madagascar",
  opportunityUrl = "https://app.ceo-summit.mg/deal-room/opp_1",
}: OpportunityContactRequestEmailProps) {
  return (
    <EmailLayout preview={`${initiatorName} souhaite vous contacter — ${opportunityTitle}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Nouvelle demande de contact
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 20px" }}>
        <strong>{initiatorName}</strong> souhaite vous contacter au sujet de votre opportunité{" "}
        <strong>{opportunityTitle}</strong>. Acceptez la demande pour démarrer une conversation
        directe avec ce membre.
      </Text>
      <a href={opportunityUrl} style={emailButtonStyle}>
        Voir la demande
      </a>
    </EmailLayout>
  );
}
