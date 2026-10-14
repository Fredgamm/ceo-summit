import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Compte » : réinitialisation et changement de mot de passe.
 */
export const ACCOUNT_APPLICATION_TEMPLATES: EmailTemplateDefinition[] = [
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
