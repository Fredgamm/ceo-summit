import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface OpportunityChangesRequestedEmailProps {
  opportunityTitle: string;
  message: string;
}

/** E8-T06 — "Demander des modifications" : message libre rédigé par l'admin, envoyé à l'auteur. */
export default function OpportunityChangesRequestedEmail({
  opportunityTitle = "Partenariat distribution solaire — Nord Madagascar",
  message = "Merci de préciser le budget et l'échéance de candidature avant republication.",
}: OpportunityChangesRequestedEmailProps) {
  return (
    <EmailLayout preview={`Modifications demandées — ${opportunityTitle}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Modifications demandées — {opportunityTitle}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A4A4A",
          margin: "0 0 16px",
          whiteSpace: "pre-line",
        }}
      >
        {message}
      </Text>
      <Text style={{ fontSize: 13, color: "#8A8A8A", margin: 0 }}>
        Vous pouvez soumettre une nouvelle version de votre opportunité à tout moment.
      </Text>
    </EmailLayout>
  );
}
