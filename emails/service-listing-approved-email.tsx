import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface ServiceListingApprovedEmailProps {
  serviceTitle: string;
  serviceUrl: string;
}

export default function ServiceListingApprovedEmail({
  serviceTitle = "Audit stratégique & accompagnement levée de fonds",
  serviceUrl = "https://app.ceo-summit.mg/catalogue/services/svc_1",
}: ServiceListingApprovedEmailProps) {
  return (
    <EmailLayout preview={`Votre fiche "${serviceTitle}" est publiée`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Votre fiche service est publiée
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 20px" }}>
        <strong>{serviceTitle}</strong> est maintenant visible dans le catalogue de services CEO
        Summit.
      </Text>
      <a href={serviceUrl} style={emailButtonStyle}>
        Voir ma fiche
      </a>
    </EmailLayout>
  );
}
