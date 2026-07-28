import { Img, Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface EventRegistrationEmailProps {
  memberName: string;
  eventTitle: string;
  eventDateLabel: string;
  eventLocation: string;
  qrCodeDataUrl: string;
  requiresManualValidation: boolean;
}

/**
 * Sent right after registration is recorded (E3-T03). The QR code (badge)
 * is issued immediately — it doubles as the check-in credential once
 * payment is validated (E3-T04 check-in flow checks `checkedIn` +
 * registration status, not just badge possession).
 */
export default function EventRegistrationEmail({
  memberName = "Jean-Pierre Rakoto",
  eventTitle = "CEO Summit 2026 — La Réunion",
  eventDateLabel = "15–16 novembre 2026",
  eventLocation = "Saint-Denis, La Réunion",
  qrCodeDataUrl = "",
  requiresManualValidation = false,
}: EventRegistrationEmailProps) {
  return (
    <EmailLayout preview={`Votre inscription à ${eventTitle} est enregistrée`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Merci, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre inscription à <strong>{eventTitle}</strong> ({eventDateLabel} · {eventLocation}) a
        bien été enregistrée.
      </Text>

      {requiresManualValidation ? (
        <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
          Votre paiement par virement est en cours de validation par l&apos;équipe CEO Summit. Votre
          badge ci-dessous sera activé dès confirmation du paiement.
        </Text>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
          Voici votre badge digital — présentez ce QR code à l&apos;accueil de l&apos;événement.
        </Text>
      )}

      {qrCodeDataUrl && (
        <Img
          src={qrCodeDataUrl}
          width={160}
          height={160}
          alt="Badge QR code"
          style={{ display: "block", margin: "0 auto 16px" }}
        />
      )}

      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        Vous retrouverez votre badge à tout moment depuis votre espace CEO Summit.
      </Text>
    </EmailLayout>
  );
}
