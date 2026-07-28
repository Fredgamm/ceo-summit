import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface CreditPurchaseConfirmedEmailProps {
  memberName: string;
  credits: number;
}

/** E6-T05 — "Email confirmation achat", envoyé une fois le paiement validé par l'admin. */
export default function CreditPurchaseConfirmedEmail({
  memberName = "Jean-Pierre Rakoto",
  credits = 5,
}: CreditPurchaseConfirmedEmailProps) {
  return (
    <EmailLayout preview={`${credits} crédits ajoutés à votre compte CEO Summit`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Merci, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre paiement a été confirmé et{" "}
        <strong>
          {credits} crédit{credits > 1 ? "s" : ""} Deal Room
        </strong>{" "}
        {credits > 1 ? "ont" : "a"} été ajouté{credits > 1 ? "s" : ""} à votre compte.
      </Text>
    </EmailLayout>
  );
}
