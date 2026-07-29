import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface MembershipRenewalReminderEmailProps {
  memberName: string;
  tier: string;
  endDateLabel: string;
}

/**
 * E8-T10 — "Abonnements expirant bientôt → ✉ Relancer". Backlog wireframe
 * calls this "relance automatique" but there's no scheduled-task infra in
 * this project (same limitation as J-7/J-1 event reminders) — this is the
 * manual equivalent, triggered by an admin clicking "Relancer" rather than
 * firing on a schedule.
 */
export default function MembershipRenewalReminderEmail({
  memberName = "Jean-Pierre Rakoto",
  tier = "Executive",
  endDateLabel = "31 août 2026",
}: MembershipRenewalReminderEmailProps) {
  return (
    <EmailLayout preview={`Votre adhésion CEO Summit ${tier} expire le ${endDateLabel}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Votre adhésion arrive à échéance
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Bonjour {memberName.split(" ")[0]}, votre adhésion CEO Summit <strong>{tier}</strong> expire
        le <strong>{endDateLabel}</strong>. Contactez l&apos;équipe CEO Summit pour renouveler votre
        adhésion et continuer à profiter du Deal Room, des événements et des salles thématiques.
      </Text>
    </EmailLayout>
  );
}
