import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface ServiceListingRefusedEmailProps {
  serviceTitle: string;
}

/** RG même logique que le refus de candidature : jamais de motif interne communiqué. */
export default function ServiceListingRefusedEmail({
  serviceTitle = "Audit stratégique & accompagnement levée de fonds",
}: ServiceListingRefusedEmailProps) {
  return (
    <EmailLayout preview={`Votre fiche "${serviceTitle}" n'a pas été retenue`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Votre fiche service n&apos;a pas été retenue
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Après examen, votre fiche <strong>{serviceTitle}</strong> n&apos;a pas été retenue pour
        publication dans le catalogue de services CEO Summit. Vous pouvez soumettre une nouvelle
        fiche à tout moment.
      </Text>
    </EmailLayout>
  );
}
