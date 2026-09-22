import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface CompanyUpsellConfirmedEmailProps {
  adminName: string;
  companyName: string;
  planName: string;
  quantity: number;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — jusqu'ici,
 * confirmer un supplément de places (Plan.isUpsell) incrémentait
 * CompanySubscription.extraSeats sans jamais en informer le gestionnaire,
 * contrairement à la confirmation du paiement initial
 * (CompanyPaymentConfirmedEmail). Voir lib/payment-confirmations.ts.
 */
export default function CompanyUpsellConfirmedEmail({
  adminName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  planName = "Executive Pass",
  quantity = 1,
}: CompanyUpsellConfirmedEmailProps) {
  const placeLabel = quantity > 1 ? "places" : "place";
  return (
    <EmailLayout preview={`Supplément confirmé — ${companyName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Supplément confirmé, {adminName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre paiement pour <strong>{quantity}</strong> {placeLabel} supplémentaire(s) —{" "}
        <strong>{planName}</strong> — a été validé pour <strong>{companyName}</strong>. Ces{" "}
        {placeLabel} sont disponibles dès maintenant : rendez-vous dans l&apos;espace de votre
        entreprise pour inviter vos collaborateurs.
      </Text>
    </EmailLayout>
  );
}
