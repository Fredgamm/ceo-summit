import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";
import { COMPANY_INVITE_TTL_MS } from "@/lib/tokens";

/** Durée de validité du lien d'invitation, en jours (`lib/tokens.ts`). */
export const COMPANY_INVITE_VALIDITY_DAYS = Math.round(
  COMPANY_INVITE_TTL_MS / (24 * 60 * 60 * 1000)
);

interface CompanyInviteEmailProps {
  inviteeName: string;
  companyName: string;
  inviteUrl: string;
  /** Durée de validité affichée — par défaut celle de `COMPANY_INVITE_TTL_MS` (7 jours). */
  validityDays?: number;
}

/**
 * Phase 2 offres/paiement (30 juillet 2026) — envoyé par inviteTeammate.
 * Audit MVP (25 septembre 2026) — précise la durée de validité du lien et
 * que l'invité choisit lui-même son mot de passe en acceptant.
 */
export default function CompanyInviteEmail({
  inviteeName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  inviteUrl = "https://app.ceo-summit.mg/invitation/token",
  validityDays = COMPANY_INVITE_VALIDITY_DAYS,
}: CompanyInviteEmailProps) {
  return (
    <EmailLayout preview={`${companyName} vous invite à rejoindre CEO Summit`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bonjour {inviteeName.split(" ")[0]},
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        <strong>{companyName}</strong> vous invite à rejoindre son équipe sur CEO Summit. Acceptez
        l&apos;invitation pour créer votre compte et accéder à la plateforme — vous choisirez
        vous-même votre mot de passe à cette étape.
      </Text>
      <a href={inviteUrl} style={emailButtonStyle}>
        Accepter l&apos;invitation
      </a>
      <Text style={{ fontSize: 12, color: "#8A8A8A", margin: "20px 0 0" }}>
        Ce lien est valable {validityDays} jours. Passé ce délai, demandez à votre gestionnaire de
        vous renvoyer une invitation.
      </Text>
    </EmailLayout>
  );
}
