import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Compte / candidature » — à porter depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const ACCOUNT_APPLICATION_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "activation",
    category: "ACCOUNT_APPLICATION",
    label: "Lien d'activation",
    description:
      "Envoyé au candidat quand l'admin approuve sa candidature (compte créé en attente d'activation) — également renvoyé depuis la page de connexion si le lien précédent a expiré.",
    triggerHint: "app/actions/candidatures.ts::approveApplication",
    variables: [
      { key: "memberName", label: "Nom du membre", example: "Jean-Pierre Rakoto" },
      { key: "tier", label: "Tier de membership", example: "Executive" },
      {
        key: "activationUrl",
        label: "Lien d'activation",
        example: "https://app.ceo-summit.mg/activer/token",
      },
    ],
    defaultSubject: "Votre accès CEO Summit est prêt — activez votre compte",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Bienvenue, {{memberName}}." },
      {
        id: "2",
        type: "paragraph",
        text: "Votre candidature a été acceptée et votre compte CEO Summit — membership **{{tier}}** — est créé. Il ne reste qu'une étape : choisir votre mot de passe pour accéder à la Deal Room, aux événements et aux salles thématiques réservées aux membres.",
      },
      { id: "3", type: "button", label: "Activer mon compte", url: "{{activationUrl}}" },
      {
        id: "4",
        type: "paragraph",
        text: "Ce lien est valable 72 heures. Passé ce délai, vous pourrez en demander un nouveau depuis la page de connexion.",
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
        example: "https://app.ceo-summit.mg/reinitialiser/token",
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
  {
    key: "application-received",
    category: "ACCOUNT_APPLICATION",
    label: "Accusé de réception de candidature",
    description:
      "Accusé de réception envoyé au candidat immédiatement après la soumission du formulaire public de candidature (/demande-acces).",
    triggerHint: "app/actions/apply.ts::submitApplication",
    variables: [{ key: "candidateName", label: "Nom du candidat", example: "Jean Dupont" }],
    defaultSubject: "Votre candidature au CEO Summit a bien été reçue",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Bonjour {{candidateName}}," },
      {
        id: "2",
        type: "paragraph",
        text: "Nous avons bien reçu votre candidature au CEO Summit. Notre équipe l'examine avec attention et vous répondra sous 48 à 72h ouvrées.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Vous recevrez un email dès qu'une décision aura été prise.",
      },
    ],
  },
  {
    key: "application-refused",
    category: "ACCOUNT_APPLICATION",
    label: "Candidature refusée",
    description:
      "Envoyé au candidat quand l'admin refuse sa candidature. Ne contient volontairement aucun motif (RG-07 : le motif de refus n'est jamais communiqué au candidat ni au parrain).",
    triggerHint: "app/actions/candidatures.ts::refuseApplication",
    variables: [{ key: "candidateName", label: "Nom du candidat", example: "Jean Dupont" }],
    defaultSubject: "Votre candidature au CEO Summit",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Bonjour {{candidateName}}," },
      {
        id: "2",
        type: "paragraph",
        text: "Nous vous remercions pour l'intérêt que vous portez au CEO Summit et pour le temps consacré à votre candidature.",
      },
      {
        id: "3",
        type: "paragraph",
        text: "Après examen, nous ne sommes pas en mesure de donner suite favorablement à votre demande d'adhésion pour le moment. Cette décision ne remet nullement en cause votre parcours professionnel.",
      },
      {
        id: "4",
        type: "paragraph",
        text: "Nous vous souhaitons beaucoup de succès dans vos projets.",
      },
    ],
  },
  {
    key: "application-more-info",
    category: "ACCOUNT_APPLICATION",
    label: "Demande de complément d'information",
    description:
      "Envoyé au candidat quand l'admin demande un complément d'information sur une candidature en cours d'examen ; le candidat peut répondre directement à cet email.",
    triggerHint: "app/actions/candidatures.ts::requestMoreInfo",
    variables: [
      { key: "candidateName", label: "Nom du candidat", example: "Jean Dupont" },
      {
        key: "message",
        label: "Message de l'équipe",
        example:
          "Merci de nous transmettre une copie de votre carte de visite professionnelle ainsi que l'organigramme de votre société.",
      },
    ],
    defaultSubject: "Complément d'information — votre candidature CEO Summit",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Bonjour {{candidateName}}," },
      {
        id: "2",
        type: "paragraph",
        text: "Merci pour votre candidature au CEO Summit. Pour poursuivre l'examen de votre dossier, l'équipe CEO Summit a besoin d'un complément d'information :",
      },
      { id: "3", type: "paragraph", text: "{{message}}" },
      { id: "4", type: "paragraph", text: "Vous pouvez répondre directement à cet email." },
    ],
  },
];
