import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface AdminServiceListingAlertEmailProps {
  authorName: string;
  serviceTitle: string;
}

/** E5-T03 — "Modération admin avant publication". */
export default function AdminServiceListingAlertEmail({
  authorName = "Jean-Pierre Rakoto",
  serviceTitle = "Audit stratégique & accompagnement levée de fonds",
}: AdminServiceListingAlertEmailProps) {
  return (
    <EmailLayout preview={`Nouvelle fiche service à modérer — ${serviceTitle}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Nouvelle fiche service à modérer
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        <strong>{authorName}</strong> a soumis <strong>{serviceTitle}</strong> pour publication dans
        le catalogue de services. Elle est en attente de validation dans le back-office.
      </Text>
    </EmailLayout>
  );
}
