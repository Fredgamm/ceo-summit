import { Text } from "@react-email/components";

import { EmailLayout, emailColors } from "@/emails/components/email-layout";

interface CompanyAdminReassignedEmailProps {
  memberName: string;
  companyName: string;
  /** true = destinataire = nouvel admin ; false = destinataire = ancien admin. */
  isNewAdmin: boolean;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — reassignCompanyAdmin
 * changeait companyAdminId (droits de paiement/invitation) sans notifier ni
 * l'ancien ni le nouvel admin. Même template, deux formulations selon le
 * destinataire.
 */
export default function CompanyAdminReassignedEmail({
  memberName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  isNewAdmin = true,
}: CompanyAdminReassignedEmailProps) {
  return (
    <EmailLayout
      preview={
        isNewAdmin
          ? `Vous êtes désormais admin de ${companyName}`
          : `Changement d'admin — ${companyName}`
      }
    >
      <Text style={{ fontSize: 18, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        {isNewAdmin ? "Vous êtes désormais administrateur" : "Changement d'administrateur"}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        {isNewAdmin ? (
          <>
            Bonjour {memberName.split(" ")[0]}, l&apos;équipe CEO Summit vous a désigné
            administrateur de l&apos;entreprise <strong>{companyName}</strong>. Vous pouvez
            désormais gérer les paiements et inviter des collaborateurs depuis votre espace.
          </>
        ) : (
          <>
            Bonjour {memberName.split(" ")[0]}, l&apos;équipe CEO Summit a désigné un nouvel
            administrateur pour <strong>{companyName}</strong>. Vous ne gérez plus les paiements ni
            les invitations de cette entreprise.
          </>
        )}
      </Text>
    </EmailLayout>
  );
}
