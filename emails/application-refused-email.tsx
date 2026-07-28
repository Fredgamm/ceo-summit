import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface ApplicationRefusedEmailProps {
  candidateName: string;
}

/**
 * RG-07 (conception/01_onboarding_acces.md) — "Le motif de refus n'est pas
 * communiqué au candidat ni au parrain." This template deliberately carries
 * no reason field, even though the admin UI collects one internally
 * (MembershipApplication.adminNote) — don't add one here.
 */
export default function ApplicationRefusedEmail({
  candidateName = "Jean Dupont",
}: ApplicationRefusedEmailProps) {
  return (
    <EmailLayout preview="Votre candidature au CEO Summit">
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bonjour {candidateName.split(" ")[0]},
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Nous vous remercions pour l&apos;intérêt que vous portez au CEO Summit et pour le temps
        consacré à votre candidature.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Après examen, nous ne sommes pas en mesure de donner suite favorablement à votre demande
        d&apos;adhésion pour le moment. Cette décision ne remet nullement en cause votre parcours
        professionnel.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Nous vous souhaitons beaucoup de succès dans vos projets.
      </Text>
    </EmailLayout>
  );
}
