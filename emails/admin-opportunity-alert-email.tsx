import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface AdminOpportunityAlertEmailProps {
  authorName: string;
  opportunityTitle: string;
}

/** E6-T03 — "Statut pending_moderation → email admin". */
export default function AdminOpportunityAlertEmail({
  authorName = "Jean-Pierre Rakoto",
  opportunityTitle = "Recherche partenaire logistique — Nord Madagascar",
}: AdminOpportunityAlertEmailProps) {
  return (
    <EmailLayout preview={`Nouvelle opportunité à modérer — ${opportunityTitle}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Nouvelle opportunité Deal Room à modérer
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        <strong>{authorName}</strong> a soumis <strong>{opportunityTitle}</strong> pour publication.
        Elle est en attente de validation dans le back-office.
      </Text>
    </EmailLayout>
  );
}
