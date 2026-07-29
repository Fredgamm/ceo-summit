import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface OpportunityRefusedEmailProps {
  opportunityTitle: string;
  reason: string;
}

/**
 * E8-T06 — "Refuser la publication" : contrairement au refus de candidature
 * (RG-07, motif jamais communiqué), le wireframe bo-deal-room-detail.html est
 * explicite ("Motif (envoyé au membre)") — le motif est donc bien transmis ici.
 */
export default function OpportunityRefusedEmail({
  opportunityTitle = "Partenariat distribution solaire — Nord Madagascar",
  reason = "Informations insuffisantes sur le profil de partenaire recherché.",
}: OpportunityRefusedEmailProps) {
  return (
    <EmailLayout preview={`Votre opportunité "${opportunityTitle}" n'a pas été retenue`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Votre opportunité n&apos;a pas été retenue
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Après examen, <strong>{opportunityTitle}</strong> n&apos;a pas été retenue pour publication
        dans le Deal Room CEO Summit.
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A4A4A",
          margin: "0 0 16px",
          padding: "12px 16px",
          backgroundColor: "#F7F7F5",
          borderRadius: 8,
          fontStyle: "italic",
          whiteSpace: "pre-line",
        }}
      >
        {reason}
      </Text>
      <Text style={{ fontSize: 13, color: "#8A8A8A", margin: 0 }}>
        Vous pouvez soumettre une nouvelle opportunité à tout moment.
      </Text>
    </EmailLayout>
  );
}
