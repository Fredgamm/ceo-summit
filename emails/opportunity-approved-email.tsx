import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface OpportunityApprovedEmailProps {
  opportunityTitle: string;
  opportunityUrl: string;
}

/** E8-T06 — "Valider et publier" : l'opportunité est immédiatement visible par les membres. */
export default function OpportunityApprovedEmail({
  opportunityTitle = "Partenariat distribution solaire — Nord Madagascar",
  opportunityUrl = "https://app.ceosummit.mg/deal-room/opp_1",
}: OpportunityApprovedEmailProps) {
  return (
    <EmailLayout preview={`Votre opportunité "${opportunityTitle}" est publiée`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Votre opportunité est publiée
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 20px" }}>
        <strong>{opportunityTitle}</strong> est maintenant visible dans le Deal Room CEO Summit.
      </Text>
      <a href={opportunityUrl} style={emailButtonStyle}>
        Voir mon opportunité
      </a>
    </EmailLayout>
  );
}
