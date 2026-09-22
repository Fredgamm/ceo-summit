import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface OpportunityContactAcceptedEmailProps {
  receiverName: string;
  opportunityTitle: string;
  conversationUrl: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — pendant du
 * OpportunityContactRequestEmail : jusqu'ici, l'initiateur d'une demande de
 * contact n'était jamais informé de son acceptation, alors que
 * acceptOpportunityContact crée déjà la conversation (app/actions/deal-room.ts).
 */
export default function OpportunityContactAcceptedEmail({
  receiverName = "Jean-Pierre Rakoto",
  opportunityTitle = "Partenariat distribution solaire — Nord Madagascar",
  conversationUrl = "https://app.ceo-summit.mg/messagerie/conv_1",
}: OpportunityContactAcceptedEmailProps) {
  return (
    <EmailLayout preview={`${receiverName} a accepté votre demande de contact`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Demande de contact acceptée
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 20px" }}>
        <strong>{receiverName}</strong> a accepté votre demande de contact au sujet de
        l&apos;opportunité <strong>{opportunityTitle}</strong>. Une conversation a été créée — vous
        pouvez échanger directement dès maintenant.
      </Text>
      <a href={conversationUrl} style={emailButtonStyle}>
        Ouvrir la conversation
      </a>
    </EmailLayout>
  );
}
