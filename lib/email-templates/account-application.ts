import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Compte » : confirmation d'adresse, réinitialisation et
 * changement de mot de passe.
 */
export const ACCOUNT_APPLICATION_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "email-verification",
    category: "ACCOUNT_APPLICATION",
    label: "Confirmation de l'adresse e-mail",
    description:
      "Envoyé au gestionnaire juste après son inscription (et à chaque renvoi) : le paiement n'est possible qu'une fois l'adresse confirmée par ce lien.",
    triggerHint: "lib/email-verification.ts::sendEmailVerification",
    variables: [
      { key: "memberName", label: "Nom du gestionnaire", example: "Jean-Pierre Rakoto" },
      {
        key: "verifyUrl",
        label: "Lien de confirmation",
        example: "https://b2b.ceo-summit.mg/verifier-email/token",
      },
    ],
    defaultSubject: "Confirmez votre adresse e-mail — CEO Summit",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Confirmez votre adresse e-mail" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberName}}, merci pour votre inscription sur CEO Summit. Pour continuer vers le paiement, confirmez que cette adresse est bien la vôtre.",
      },
      { id: "3", type: "button", label: "Confirmer mon adresse e-mail", url: "{{verifyUrl}}" },
      {
        id: "4",
        type: "paragraph",
        text: "Ce lien est valable 72 heures. Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail.",
      },
    ],
  },
  {
    key: "reset-password",
    category: "ACCOUNT_APPLICATION",
    label: "Réinitialisation du mot de passe",
    description:
      "Envoyé au membre qui demande la réinitialisation de son mot de passe depuis la page de connexion.",
    triggerHint: "app/actions/auth.ts::requestPasswordReset",
    variables: [
      { key: "memberName", label: "Nom du membre", example: "Jean-Pierre Rakoto" },
      {
        key: "resetUrl",
        label: "Lien de réinitialisation",
        example: "https://b2b.ceo-summit.mg/reinitialiser/token",
      },
    ],
    defaultSubject: "Réinitialisez votre mot de passe CEO Summit",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Réinitialisation du mot de passe" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberName}}, vous avez demandé la réinitialisation de votre mot de passe CEO Summit. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
      },
      { id: "3", type: "button", label: "Réinitialiser mon mot de passe", url: "{{resetUrl}}" },
      {
        id: "4",
        type: "paragraph",
        text: "Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe actuel reste inchangé.",
      },
    ],
  },
  {
    key: "password-changed",
    category: "ACCOUNT_APPLICATION",
    label: "Confirmation de changement de mot de passe",
    description:
      "Confirmation de sécurité envoyée au membre juste après la modification réussie de son mot de passe (permet de détecter une prise de contrôle de compte).",
    triggerHint: "app/actions/auth.ts::resetPassword",
    variables: [{ key: "memberName", label: "Nom du membre", example: "Jean-Pierre Rakoto" }],
    defaultSubject: "Votre mot de passe CEO Summit a été modifié",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Mot de passe modifié" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberName}}, le mot de passe de votre compte CEO Summit vient d'être modifié. Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement l'équipe CEO Summit.",
      },
    ],
  },
];
