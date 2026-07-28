import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface ApplicationMoreInfoEmailProps {
  candidateName: string;
  message: string;
}

/** E8-T03 — "Demander info complémentaire" action on a pending candidature. */
export default function ApplicationMoreInfoEmail({
  candidateName = "Jean Dupont",
  message = "",
}: ApplicationMoreInfoEmailProps) {
  return (
    <EmailLayout preview="Complément d'information — votre candidature CEO Summit">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bonjour {candidateName.split(" ")[0]},
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Merci pour votre candidature au CEO Summit. Pour poursuivre l&apos;examen de votre dossier,
        l&apos;équipe CEO Summit a besoin d&apos;un complément d&apos;information :
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "#4A4A4A",
          margin: "0 0 16px",
          padding: "12px 16px",
          backgroundColor: "#F7F7F5",
          borderRadius: 6,
          whiteSpace: "pre-line",
        }}
      >
        {message}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: 0 }}>
        Vous pouvez répondre directement à cet email.
      </Text>
    </EmailLayout>
  );
}
