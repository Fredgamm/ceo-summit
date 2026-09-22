import { Text } from "@react-email/components";

import { EmailLayout, emailButtonStyle, emailColors } from "@/emails/components/email-layout";

interface CompanyCollaboratorWelcomeEmailProps {
  memberName: string;
  companyName: string;
  loginUrl: string;
}

/**
 * 22 septembre 2026 (audit des emails transactionnels) — jusqu'ici, un
 * collaborateur qui acceptait une invitation n'était confirmé par email que
 * dans le cas où l'abonnement de l'entreprise était déjà ACTIVE et lié à un
 * évènement avec de la place (EventRegistrationEmail, voir
 * acceptCompanyInvite) — dans tous les autres cas (offre encore en revue,
 * offre plateforme sans évènement, évènement complet), le compte était créé
 * et actif sans aucune confirmation. Envoyé systématiquement, en plus de
 * EventRegistrationEmail quand ce dernier s'applique aussi.
 */
export default function CompanyCollaboratorWelcomeEmail({
  memberName = "Jean-Pierre Rakoto",
  companyName = "Rakoto Holding",
  loginUrl = "https://app.ceo-summit.mg/login",
}: CompanyCollaboratorWelcomeEmailProps) {
  return (
    <EmailLayout preview={`Bienvenue sur CEO Summit, au nom de ${companyName}`}>
      <Text style={{ fontSize: 20, fontWeight: 700, color: emailColors.navy, margin: "0 0 16px" }}>
        Bienvenue, {memberName.split(" ")[0]}.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A4A", margin: "0 0 16px" }}>
        Votre compte est créé et actif — vous faites maintenant partie de l&apos;équipe{" "}
        <strong>{companyName}</strong> sur CEO Summit.
      </Text>
      <a href={loginUrl} style={emailButtonStyle}>
        Accéder à mon espace
      </a>
    </EmailLayout>
  );
}
