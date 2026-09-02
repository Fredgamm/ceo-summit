import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface EventRegistrationEmailProps {
  memberName: string;
  eventTitle: string;
  eventDateLabel: string;
  eventLocation: string;
  requiresManualValidation: boolean;
}

/**
 * Sent right after registration is recorded (E3-T03).
 *
 * Décision d'architecture (sept. 2026, conception/09) — le QR code de badge
 * et le check-in physique sont retirés du chemin actif : CEO Summit ne gère
 * plus les entrées/sorties, un système externe (Evolia) en sera responsable
 * en aval. `EventRegistration.badgeQrCode`/`checkedIn` restent en base
 * (non supprimés), simplement plus générés/affichés ici.
 */
export default function EventRegistrationEmail({
  memberName = "Jean-Pierre Rakoto",
  eventTitle = "CEO Summit 2026 — La Réunion",
  eventDateLabel = "15–16 novembre 2026",
  eventLocation = "Saint-Denis, La Réunion",
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
          Votre paiement par virement est en cours de validation par l&apos;équipe CEO Summit. Vous
          recevrez une confirmation dès validation.
        </Text>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
          Retrouvez les détails de votre inscription à tout moment depuis votre espace CEO Summit.
        </Text>
      )}

      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        À bientôt à {eventTitle} !
      </Text>
    </EmailLayout>
  );
}
