import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface MembershipPaymentConfirmedEmailProps {
  memberName: string;
  planName: string;
}

/** Phase 2ter (1er août 2026) — miroir de CompanyPaymentConfirmedEmail, envoyé par confirmMembershipPayment. */
export default function MembershipPaymentConfirmedEmail({
  memberName = "Jean-Pierre Rakoto",
  planName = "Executive pass",
}: MembershipPaymentConfirmedEmailProps) {
  return (
    <EmailLayout preview={`Paiement confirmé — ${planName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Paiement confirmé, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre adhésion <strong>{planName}</strong> a été validée — l&apos;accès à la plateforme est
        maintenant actif.
      </Text>
    </EmailLayout>
  );
}
