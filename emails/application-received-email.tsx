import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface ApplicationReceivedEmailProps {
  candidateName: string;
}

/** E1-Bxx — accusé de réception envoyé à la soumission de /demande-acces. */
export default function ApplicationReceivedEmail({
  candidateName = "Jean Dupont",
}: ApplicationReceivedEmailProps) {
  return (
    <EmailLayout preview="Votre candidature au CEO Summit a bien été reçue">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bonjour {candidateName.split(" ")[0]},
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Nous avons bien reçu votre candidature au CEO Summit. Notre équipe l&apos;examine avec
        attention et vous répondra sous 48 à 72h ouvrées.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Vous recevrez un email dès qu&apos;une décision aura été prise.
      </Text>
    </EmailLayout>
  );
}
