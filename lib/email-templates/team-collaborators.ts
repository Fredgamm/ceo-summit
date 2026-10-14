import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Équipe / collaborateurs » — porté depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const TEAM_COLLABORATORS_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "partner-invite",
    category: "TEAM_COLLABORATORS",
    label: "Invitation partenaire",
    description:
      "Envoyé au gérant d'un partenaire (institutionnel, média…) invité par l'admin, pour qu'il crée son compte et son entreprise, sans paiement.",
    triggerHint: "app/actions/admin-partners.ts::invitePartner (aussi resendPartnerInvite)",
    variables: [
      { key: "inviteeFirstName", label: "Prénom du gérant", example: "Hery" },
      {
        key: "offerName",
        label: "Nom de l'offre partenaire",
        example: "Partenaire Institutionnel",
      },
      { key: "memberLimit", label: "Nombre de membres", example: "2" },
      {
        key: "inviteUrl",
        label: "Lien d'inscription",
        example: "https://b2b.ceo-summit.mg/partenaire/token",
      },
    ],
    defaultSubject: "Votre accès partenaire CEO Summit",
    defaultBlocks: [
      { id: "greeting", type: "heading", text: "Bonjour {{inviteeFirstName}}," },
      {
        id: "intro",
        type: "paragraph",
        text: "L'équipe CEO Summit vous invite à rejoindre la plateforme au titre de l'offre **{{offerName}}**. Créez votre compte et votre entreprise : votre accès est ouvert immédiatement, sans paiement.",
      },
      { id: "cta", type: "button", label: "Créer mon compte", url: "{{inviteUrl}}" },
      {
        id: "team",
        type: "paragraph",
        text: "Votre espace compte {{memberLimit}} membre(s) : vous pourrez ensuite inviter vos collaborateurs depuis la fiche de votre entreprise.",
      },
      {
        id: "validity",
        type: "paragraph",
        text: "Ce lien est valable 7 jours. Passé ce délai, demandez à l'équipe CEO Summit de vous en renvoyer un.",
      },
    ],
  },
  {
    key: "company-invite",
    category: "TEAM_COLLABORATORS",
    label: "Invitation collaborateur",
    description:
      "Envoyé au collaborateur invité par un admin d'entreprise, pour qu'il rejoigne l'équipe sur CEO Summit et crée son compte.",
    triggerHint: "app/actions/company-invites.ts::inviteTeammate (aussi resendInvite)",
    variables: [
      { key: "inviteeFirstName", label: "Prénom de l'invité", example: "Jean-Pierre" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      {
        key: "inviteUrl",
        label: "Lien d'invitation",
        example: "https://b2b.ceo-summit.mg/invitation/token",
      },
    ],
    defaultSubject: "{{companyName}} vous invite à rejoindre CEO Summit",
    defaultBlocks: [
      {
        id: "greeting",
        type: "heading",
        text: "Bonjour {{inviteeFirstName}},",
      },
      {
        id: "intro",
        type: "paragraph",
        text: "**{{companyName}}** vous invite à rejoindre son équipe sur CEO Summit. Acceptez l'invitation pour créer votre compte et accéder à la plateforme — vous choisirez vous-même votre mot de passe à cette étape.",
      },
      {
        id: "cta",
        type: "button",
        label: "Accepter l'invitation",
        url: "{{inviteUrl}}",
      },
      {
        id: "validity",
        type: "paragraph",
        text: "Ce lien est valable 7 jours. Passé ce délai, demandez à votre gestionnaire de vous renvoyer une invitation.",
      },
    ],
  },
  {
    key: "company-collaborator-welcome",
    category: "TEAM_COLLABORATORS",
    label: "Bienvenue collaborateur",
    description:
      "Envoyé systématiquement au collaborateur qui vient d'accepter une invitation, pour confirmer que son compte est créé et actif.",
    triggerHint: "app/actions/company-invites.ts::acceptCompanyInvite",
    variables: [
      { key: "memberFirstName", label: "Prénom du membre", example: "Jean-Pierre" },
      { key: "companyName", label: "Nom de l'entreprise", example: "Rakoto Holding" },
      { key: "loginUrl", label: "Lien de connexion", example: "https://b2b.ceo-summit.mg/login" },
    ],
    defaultSubject: "Bienvenue sur CEO Summit — {{companyName}}",
    defaultBlocks: [
      {
        id: "greeting",
        type: "heading",
        text: "Bienvenue, {{memberFirstName}}.",
      },
      {
        id: "intro",
        type: "paragraph",
        text: "Votre compte est créé et actif — vous faites maintenant partie de l'équipe **{{companyName}}** sur CEO Summit.",
      },
      {
        id: "cta",
        type: "button",
        label: "Accéder à mon espace",
        url: "{{loginUrl}}",
      },
    ],
  },
];
