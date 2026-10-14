import type { EmailTemplateDefinition } from "./types";

/**
 * Catégorie « Salles / modération » — porté depuis les composants `emails/*.tsx`
 * correspondants (voir C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md
 * §9, Lot 1). Fichier volontairement isolé par catégorie : pas de conflit
 * de fusion possible entre les agents qui portent chacune des 9 catégories.
 */
export const ROOM_MODERATION_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "member-suspended",
    category: "ROOM_MODERATION",
    label: "Compte suspendu",
    description:
      "Envoyé au membre quand l'admin suspend son compte — jusqu'ici il ne le découvrait qu'en échouant à se connecter.",
    triggerHint: "app/actions/members.ts::setMemberStatus (suspendMember)",
    variables: [{ key: "memberFirstName", label: "Prénom du membre", example: "Jean-Pierre" }],
    defaultSubject: "Votre compte CEO Summit a été suspendu",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Compte suspendu" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberFirstName}}, votre compte CEO Summit a été suspendu par l'équipe d'administration. L'accès à la plateforme est temporairement indisponible. Pour toute question, contactez l'équipe CEO Summit.",
      },
    ],
  },
  {
    key: "member-excluded",
    category: "ROOM_MODERATION",
    label: "Compte résilié",
    description:
      "Envoyé au membre quand l'admin résilie son compte — jusqu'ici il ne le découvrait qu'en échouant à se connecter.",
    triggerHint: "app/actions/members.ts::setMemberStatus (excludeMember)",
    variables: [{ key: "memberFirstName", label: "Prénom du membre", example: "Jean-Pierre" }],
    defaultSubject: "Votre compte CEO Summit a été résilié",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Compte résilié" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberFirstName}}, votre compte CEO Summit a été résilié par l'équipe d'administration. L'accès à la plateforme n'est plus disponible. Pour toute question, contactez l'équipe CEO Summit.",
      },
    ],
  },
  {
    key: "member-reactivated",
    category: "ROOM_MODERATION",
    label: "Compte réactivé",
    description:
      "Envoyé au membre quand l'admin réactive son compte, pendant de la suspension/résiliation — sans quoi il n'a aucun moyen de savoir que son accès est revenu.",
    triggerHint: "app/actions/members.ts::setMemberStatus (reactivateMember)",
    variables: [
      { key: "memberFirstName", label: "Prénom du membre", example: "Jean-Pierre" },
      { key: "loginUrl", label: "Lien de connexion", example: "https://b2b.ceo-summit.mg/login" },
    ],
    defaultSubject: "Votre compte CEO Summit a été réactivé",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Compte réactivé" },
      {
        id: "2",
        type: "paragraph",
        text: "Bonjour {{memberFirstName}}, votre compte CEO Summit a été réactivé — vous pouvez de nouveau accéder à la plateforme.",
      },
      { id: "3", type: "button", label: "Me connecter", url: "{{loginUrl}}" },
    ],
  },
  {
    key: "member-room-warning",
    category: "ROOM_MODERATION",
    label: "Avertissement — salle",
    description:
      "Envoyé au membre quand l'admin choisit la décision « Avertir » sur un signalement de message dans une salle thématique.",
    triggerHint: "app/actions/admin-rooms.ts::resolveRoomReport",
    variables: [{ key: "roomName", label: "Nom de la salle", example: "Énergie & Environnement" }],
    defaultSubject: "Avertissement — salle {{roomName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Avertissement — salle {{roomName}}" },
      {
        id: "2",
        type: "paragraph",
        text: "Un message que vous avez publié dans la salle **{{roomName}}** a été signalé et jugé non conforme à la charte des salles thématiques CEO Summit. Merci de veiller au respect des échanges dans les prochaines discussions.",
      },
    ],
  },
  {
    key: "member-room-exclusion",
    category: "ROOM_MODERATION",
    label: "Exclusion temporaire — salle",
    description:
      "Envoyé au membre quand l'admin choisit la décision « Exclure » sur un signalement de message : informe de la suspension temporaire d'accès à cette salle.",
    triggerHint: "app/actions/admin-rooms.ts::resolveRoomReport",
    variables: [
      { key: "roomName", label: "Nom de la salle", example: "Énergie & Environnement" },
      {
        key: "suspendedUntilLabel",
        label: "Suspendu jusqu'au",
        example: "29 septembre 2026",
      },
    ],
    defaultSubject: "Exclusion temporaire — salle {{roomName}}",
    defaultBlocks: [
      { id: "1", type: "heading", text: "Exclusion temporaire — salle {{roomName}}" },
      {
        id: "2",
        type: "paragraph",
        text: "Suite au signalement d'un message que vous avez publié dans la salle **{{roomName}}**, votre accès à cette salle est suspendu jusqu'au **{{suspendedUntilLabel}}**. Le reste de la plateforme reste accessible.",
      },
    ],
  },
];
