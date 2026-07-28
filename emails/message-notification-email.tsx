import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface MessageNotificationEmailProps {
  senderName: string;
  preview: string;
  conversationUrl: string;
}

/**
 * E7-T03 — "Si destinataire offline (pas de socket connecté) → email Resend
 * dans les 60s. Template : aperçu du message + bouton Répondre."
 */
export default function MessageNotificationEmail({
  senderName = "Rabe Andriamahefa",
  preview = "Bonjour, je voulais revenir sur votre intérêt pour notre opportunité…",
  conversationUrl = "https://app.ceosummit.mg/messagerie/conv_1",
}: MessageNotificationEmailProps) {
  return (
    <EmailLayout preview={`${senderName} vous a envoyé un message`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Nouveau message de {senderName}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A4A4A",
          margin: "0 0 20px",
          padding: "12px 16px",
          backgroundColor: "#F7F7F5",
          borderRadius: 8,
          fontStyle: "italic",
        }}
      >
        &ldquo;{preview}&rdquo;
      </Text>
      <a href={conversationUrl} style={emailButtonStyle}>
        Répondre
      </a>
    </EmailLayout>
  );
}
