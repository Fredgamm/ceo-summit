import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface MembershipPaymentRejectedEmailProps {
  memberName: string;
  planName: string;
  reason: string;
}

/** Phase 2ter (1er août 2026) — miroir de CompanyPaymentRejectedEmail, envoyé par rejectMembershipPayment. */
export default function MembershipPaymentRejectedEmail({
  memberName = "Jean-Pierre Rakoto",
  planName = "Executive pass",
  reason = "Preuve illisible",
}: MembershipPaymentRejectedEmailProps) {
  return (
    <EmailLayout preview={`Paiement à corriger — ${planName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Un correctif est nécessaire, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 8px" }}>
        Le paiement soumis pour <strong>{planName}</strong> n&apos;a pas pu être validé :
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: emailColors.navy,
          fontStyle: "italic",
          margin: "0 0 16px",
          padding: "10px 14px",
          background: "#F7F7F5",
          borderRadius: 6,
        }}
      >
        {reason}
      </Text>
      <a href="https://app.ceosummit.mg/adhesion/paiement" style={emailButtonStyle}>
        Soumettre un nouveau paiement
      </a>
    </EmailLayout>
  );
}
