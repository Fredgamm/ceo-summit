import type { EmailBlock } from "@/lib/email-blocks";
import type { EmailTemplateDefinition, EmailVariableDef } from "./types";

/**
 * Catégorie « Rendez-vous B2B » (module 21, lot 7) — textes de
 * `docs/21_annexe_emails_rendez_vous.md`. Le texte de l'email de demande est
 * celui du client (`doc-rdv-evenement.md` §7, « Email 2.A ») ; les autres sont
 * des projets validés le 3 novembre 2026. Tout se modifie ensuite dans
 * Admin → Emails.
 *
 * Les valeurs saisies par les membres (noms, entreprise, fonction, motif) sont
 * nettoyées avant d'arriver ici (`lib/meeting-emails.ts`) : un `**` ou un
 * `[lien](…)` tapé dans un motif ne doit jamais se transformer en mise en
 * forme ni en lien cliquable dans un email envoyé par la plateforme.
 */

const CLOSING: EmailBlock[] = [
  { id: "z1", type: "paragraph", text: "Le comité d'organisation vous remercie." },
  { id: "z2", type: "paragraph", text: "Cordialement, **L'équipe CEO Summit Indian Ocean**" },
  {
    id: "z3",
    type: "paragraph",
    text: "_Notification automatique - Plateforme Networking CEO Summit_",
  },
];

const v = (key: string, label: string, example: string): EmailVariableDef => ({
  key,
  label,
  example,
});

const FIRST_NAME = v("firstName", "Prénom du destinataire", "Marie");
const EVENT_TITLE = v("eventTitle", "Titre de l'évènement", "CEO Summit 2027 — La Réunion");
const EVENT_LOCATION = v("eventLocation", "Lieu de l'évènement", "Palais des Congrès, Saint-Denis");
const ZONE = v("zone", "Espace RDV B2B", "Espace B2B, niveau 1");
const ACCESS = v(
  "accessInstructions",
  "Indications pour retrouver l'espace",
  "À gauche de l'accueil, présentez votre badge à l'hôtesse"
);
const SLOT_DATE = v("slotDate", "Date du créneau", "11 janvier 2027");
const SLOT_TIME = v("slotTime", "Heure du créneau", "10h30 – 11h00");
const TZ_LABEL = v("timezoneLabel", "Fuseau de l'évènement", "heure de La Réunion");
const REASON = v(
  "reason",
  "Motif de la rencontre",
  "Présenter notre offre logistique et explorer un partenariat."
);
const PARTNER_NAME = v("partnerName", "Nom de l'autre participant", "Paul Rakoto");
const PARTNER_COMPANY = v("partnerCompany", "Entreprise de l'autre participant", "Rakoto Holding");
const PARTNER_TITLE = v("partnerTitle", "Fonction de l'autre participant", "Directeur général");
const PARTNER_PHONE = v("partnerPhone", "Téléphone de l'autre participant", "+262 692 00 00 00");
const PARTNER_EMAIL = v("partnerEmail", "Email de l'autre participant", "paul@rakoto.re");
const PARTNER_PROFILE = v(
  "partnerProfileUrl",
  "Lien vers le profil de l'autre participant",
  "https://b2b.ceo-summit.mg/membres/abc"
);
const DIRECTORY_URL = v(
  "directoryUrl",
  "Lien vers la liste des membres",
  "https://b2b.ceo-summit.mg/membres"
);

/** Corps commun aux deux emails de confirmation (demandeur et destinataire). */
function confirmedBlocks(intro: string): EmailBlock[] {
  return [
    { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
    { id: "b2", type: "paragraph", text: intro },
    { id: "b3", type: "paragraph", text: "**Rendez-vous :**" },
    {
      id: "b4",
      type: "list",
      style: "bullet",
      items: [
        "Événement : {{eventTitle}}",
        "Lieu : {{eventLocation}}",
        "Espace RDV : {{zone}}",
        "Indications : {{accessInstructions}}",
        "Date : {{slotDate}}",
        "Heure : {{slotTime}} ({{timezoneLabel}})",
      ],
    },
    { id: "b5", type: "paragraph", text: "**Votre interlocuteur :**" },
    {
      id: "b6",
      type: "list",
      style: "bullet",
      items: [
        "Nom : {{partnerName}}",
        "Entreprise : {{partnerCompany}}",
        "Fonction : {{partnerTitle}}",
        "Téléphone : {{partnerPhone}}",
        "Email : {{partnerEmail}}",
        "Profil : [{{partnerName}}]({{partnerProfileUrl}})",
      ],
    },
    { id: "b7", type: "paragraph", text: "**Motif de la rencontre :**" },
    { id: "b8", type: "paragraph", text: "{{reason}}" },
    {
      id: "b9",
      type: "paragraph",
      text: "Le fichier calendrier de ce rendez-vous est joint à cet email. Vous pouvez aussi l'ajouter à votre agenda : [fichier calendrier]({{icsUrl}}) · [Google Agenda]({{googleCalendarUrl}}).",
    },
    ...CLOSING,
  ];
}

const CONFIRMED_VARIABLES: EmailVariableDef[] = [
  FIRST_NAME,
  EVENT_TITLE,
  EVENT_LOCATION,
  ZONE,
  ACCESS,
  SLOT_DATE,
  SLOT_TIME,
  TZ_LABEL,
  PARTNER_NAME,
  PARTNER_COMPANY,
  PARTNER_TITLE,
  PARTNER_PHONE,
  PARTNER_EMAIL,
  PARTNER_PROFILE,
  REASON,
  v("icsUrl", "Lien du fichier calendrier", "https://b2b.ceo-summit.mg/api/rendez-vous/abc/ics"),
  v("googleCalendarUrl", "Lien Google Agenda", "https://calendar.google.com/calendar/render?..."),
];

export const MEETINGS_TEMPLATES: EmailTemplateDefinition[] = [
  {
    key: "meeting-request-received",
    category: "MEETINGS",
    label: "Rendez-vous B2B — nouvelle demande",
    description:
      "Envoyé au destinataire d'une demande de rendez-vous, avec les boutons Accepter et Décliner (liens personnels à usage unique, valables tant que la demande est en attente).",
    triggerHint: "app/actions/meeting-requests.ts::requestMeeting",
    variables: [
      FIRST_NAME,
      v("requesterName", "Nom du demandeur", "Marie Andrianina"),
      v("requesterCompany", "Entreprise du demandeur", "Océan Logistique"),
      v("requesterTitle", "Fonction du demandeur", "Directrice commerciale"),
      EVENT_TITLE,
      EVENT_LOCATION,
      ZONE,
      ACCESS,
      SLOT_DATE,
      SLOT_TIME,
      TZ_LABEL,
      REASON,
      v(
        "requesterProfileUrl",
        "Lien vers le profil du demandeur",
        "https://b2b.ceo-summit.mg/membres/abc"
      ),
      v(
        "acceptUrl",
        "Lien « Accepter » (usage unique)",
        "https://b2b.ceo-summit.mg/rendez-vous/repondre/xxxx?choix=accepter"
      ),
      v(
        "declineUrl",
        "Lien « Décliner » (usage unique)",
        "https://b2b.ceo-summit.mg/rendez-vous/repondre/xxxx?choix=decliner"
      ),
      v("expiresAt", "Échéance de la demande", "12 janvier 2027 à 09h50"),
    ],
    defaultSubject: "Nouvelle demande de rendez-vous B2B - {{requesterCompany}}",
    defaultBlocks: [
      { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
      {
        id: "b2",
        type: "paragraph",
        text: "Vous avez reçu une demande de rendez-vous pour la session Networking du CEO Summit. **{{requesterName}}**, de **{{requesterCompany}}**, souhaite vous rencontrer pendant {{eventTitle}}.",
      },
      { id: "b3", type: "paragraph", text: "**Demandeur :**" },
      {
        id: "b4",
        type: "list",
        style: "bullet",
        items: [
          "Nom : {{requesterName}}",
          "Entreprise : {{requesterCompany}}",
          "Fonction : {{requesterTitle}}",
        ],
      },
      {
        id: "b5",
        type: "paragraph",
        text: "Les coordonnées directes, comme le numéro de téléphone, ne sont partagées qu'après confirmation du rendez-vous.",
      },
      { id: "b6", type: "paragraph", text: "**Événement :**" },
      {
        id: "b7",
        type: "list",
        style: "bullet",
        items: [
          "Titre : {{eventTitle}}",
          "Lieu : {{eventLocation}}",
          "Espace RDV : {{zone}}",
          "Indications : {{accessInstructions}}",
        ],
      },
      { id: "b8", type: "paragraph", text: "**Créneau demandé :**" },
      {
        id: "b9",
        type: "list",
        style: "bullet",
        items: ["Date : {{slotDate}}", "Heure : {{slotTime}} ({{timezoneLabel}})"],
      },
      { id: "b10", type: "paragraph", text: "**Motif de la demande :**" },
      { id: "b11", type: "paragraph", text: "{{reason}}" },
      { id: "b12", type: "button", label: "Accepter le rendez-vous", url: "{{acceptUrl}}" },
      { id: "b13", type: "button", label: "Décliner le rendez-vous", url: "{{declineUrl}}" },
      {
        id: "b14",
        type: "paragraph",
        text: "Voir le profil : [{{requesterName}}]({{requesterProfileUrl}})",
      },
      {
        id: "b15",
        type: "paragraph",
        text: "Ces liens sont personnels, sécurisés et utilisables une seule fois. Sans réponse avant **{{expiresAt}}**, la demande pourra expirer automatiquement.",
      },
      ...CLOSING,
    ],
  },
  {
    key: "meeting-confirmed-requester",
    category: "MEETINGS",
    label: "Rendez-vous B2B — confirmé (demandeur)",
    description:
      "Envoyé au demandeur quand le destinataire accepte. Contient le téléphone et l'email du partenaire (seul moment où ils sont communiqués) et le fichier calendrier en pièce jointe.",
    triggerHint: "lib/meeting-response.ts::respondToMeeting (acceptation)",
    variables: CONFIRMED_VARIABLES,
    defaultSubject: "Rendez-vous confirmé avec {{partnerName}} - {{slotDate}}, {{slotTime}}",
    defaultBlocks: confirmedBlocks(
      "**{{partnerName}}** a accepté votre demande de rendez-vous. Votre rencontre est confirmée."
    ),
  },
  {
    key: "meeting-confirmed-recipient",
    category: "MEETINGS",
    label: "Rendez-vous B2B — confirmé (destinataire)",
    description:
      "Envoyé au destinataire qui vient d'accepter une demande (depuis l'email ou « Mes rendez-vous »), avec le téléphone et l'email du demandeur et le fichier calendrier en pièce jointe.",
    triggerHint: "lib/meeting-response.ts::respondToMeeting (acceptation)",
    variables: CONFIRMED_VARIABLES,
    defaultSubject: "Rendez-vous confirmé avec {{partnerName}} - {{slotDate}}, {{slotTime}}",
    defaultBlocks: confirmedBlocks(
      "Vous avez accepté la demande de rendez-vous de **{{partnerName}}**. Votre rencontre est confirmée."
    ),
  },
  {
    key: "meeting-declined",
    category: "MEETINGS",
    label: "Rendez-vous B2B — demande refusée",
    description: "Envoyé au demandeur quand le destinataire décline sa demande.",
    triggerHint: "lib/meeting-response.ts::respondToMeeting (refus)",
    variables: [
      FIRST_NAME,
      PARTNER_NAME,
      PARTNER_COMPANY,
      SLOT_DATE,
      SLOT_TIME,
      TZ_LABEL,
      DIRECTORY_URL,
    ],
    defaultSubject: "Votre demande de rendez-vous n'a pas été retenue - {{partnerCompany}}",
    defaultBlocks: [
      { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
      {
        id: "b2",
        type: "paragraph",
        text: "**{{partnerName}}**, de **{{partnerCompany}}**, n'a pas pu donner suite à votre demande de rendez-vous du {{slotDate}}, à {{slotTime}} ({{timezoneLabel}}).",
      },
      {
        id: "b3",
        type: "paragraph",
        text: "Le créneau est de nouveau libre : vous pouvez proposer un autre horaire à cette personne, ou rencontrer d'autres participants du CEO Summit.",
      },
      { id: "b4", type: "button", label: "Voir les participants", url: "{{directoryUrl}}" },
      ...CLOSING,
    ],
  },
  {
    key: "meeting-expired-requester",
    category: "MEETINGS",
    label: "Rendez-vous B2B — demande expirée (demandeur)",
    description:
      "Envoyé au demandeur quand sa demande reste sans réponse jusqu'à l'échéance (48 h, ou 10 minutes avant le créneau).",
    triggerHint: "lib/meeting-expiry.ts + app/api/webhooks/meeting-expiry/route.ts",
    variables: [
      FIRST_NAME,
      PARTNER_NAME,
      PARTNER_COMPANY,
      SLOT_DATE,
      SLOT_TIME,
      TZ_LABEL,
      DIRECTORY_URL,
    ],
    defaultSubject: "Votre demande de rendez-vous est restée sans réponse - {{partnerCompany}}",
    defaultBlocks: [
      { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
      {
        id: "b2",
        type: "paragraph",
        text: "**{{partnerName}}**, de **{{partnerCompany}}**, n'a pas répondu à votre demande de rendez-vous du {{slotDate}}, à {{slotTime}} ({{timezoneLabel}}). La demande a donc expiré.",
      },
      {
        id: "b3",
        type: "paragraph",
        text: "Le créneau est de nouveau libre. Vous pouvez renouveler votre demande ou en adresser une à un autre participant.",
      },
      { id: "b4", type: "button", label: "Voir les participants", url: "{{directoryUrl}}" },
      ...CLOSING,
    ],
  },
  {
    key: "meeting-expired-recipient",
    category: "MEETINGS",
    label: "Rendez-vous B2B — demande expirée (destinataire)",
    description: "Envoyé au destinataire qui n'a pas répondu à une demande avant son échéance.",
    triggerHint: "lib/meeting-expiry.ts + app/api/webhooks/meeting-expiry/route.ts",
    variables: [
      FIRST_NAME,
      v("requesterName", "Nom du demandeur", "Marie Andrianina"),
      v("requesterCompany", "Entreprise du demandeur", "Océan Logistique"),
      SLOT_DATE,
      SLOT_TIME,
      TZ_LABEL,
      v(
        "requesterProfileUrl",
        "Lien vers le profil du demandeur",
        "https://b2b.ceo-summit.mg/membres/abc"
      ),
    ],
    defaultSubject: "Une demande de rendez-vous a expiré - {{requesterCompany}}",
    defaultBlocks: [
      { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
      {
        id: "b2",
        type: "paragraph",
        text: "Vous n'avez pas répondu à la demande de rendez-vous de **{{requesterName}}**, de **{{requesterCompany}}**, pour le {{slotDate}} à {{slotTime}} ({{timezoneLabel}}). La demande a donc expiré et le créneau est de nouveau libre.",
      },
      {
        id: "b3",
        type: "paragraph",
        text: "Si vous souhaitez tout de même rencontrer cette personne, vous pouvez lui proposer un créneau depuis son profil.",
      },
      {
        id: "b4",
        type: "button",
        label: "Voir son profil",
        url: "{{requesterProfileUrl}}",
      },
      ...CLOSING,
    ],
  },
  {
    key: "meeting-slots-open",
    category: "MEETINGS",
    label: "Rendez-vous B2B — vos créneaux sont ouverts",
    description:
      "Envoyé aux participants déjà inscrits quand l'organisation publie les créneaux de rendez-vous. Les créneaux sont actifs par défaut.",
    triggerHint: "app/actions/admin-meetings.ts::publishMeetingSlots",
    variables: [
      FIRST_NAME,
      EVENT_TITLE,
      ZONE,
      ACCESS,
      TZ_LABEL,
      v(
        "mySlotsUrl",
        "Lien vers « Mes créneaux »",
        "https://b2b.ceo-summit.mg/profil?onglet=creneaux"
      ),
    ],
    defaultSubject: "Vous participez aux rendez-vous B2B : vérifiez vos créneaux",
    defaultBlocks: [
      { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
      {
        id: "b2",
        type: "paragraph",
        text: "Vous participez aux rendez-vous B2B du **{{eventTitle}}**.",
      },
      {
        id: "b3",
        type: "paragraph",
        text: "Les créneaux de rencontre sont ouverts. Ils sont tous actifs par défaut : les autres participants peuvent vous demander un rendez-vous dès maintenant. Désactivez simplement ceux où vous n'êtes pas disponible.",
      },
      { id: "b4", type: "paragraph", text: "**Rencontres :**" },
      {
        id: "b5",
        type: "list",
        style: "bullet",
        items: [
          "Espace RDV : {{zone}}",
          "Indications : {{accessInstructions}}",
          "Horaires affichés en {{timezoneLabel}}",
        ],
      },
      { id: "b6", type: "button", label: "Gérer mes créneaux", url: "{{mySlotsUrl}}" },
      {
        id: "b7",
        type: "paragraph",
        text: "Les demandes sont possibles jusqu'à la fin de l'événement. Votre numéro de téléphone n'est partagé qu'avec les personnes dont vous confirmez le rendez-vous.",
      },
      ...CLOSING,
    ],
  },
  {
    key: "meeting-cancelled-by-organizer",
    category: "MEETINGS",
    label: "Rendez-vous B2B — annulé par l'organisation",
    description:
      "Envoyé aux deux personnes d'une demande ou d'un rendez-vous annulé par l'organisation : créneau désactivé par l'admin, ou participant retiré de la liste par son gérant.",
    triggerHint:
      "app/actions/admin-meetings.ts::setMeetingSlotDisabled ; app/actions/company-participants.ts::validateEventParticipants",
    variables: [
      FIRST_NAME,
      EVENT_TITLE,
      PARTNER_NAME,
      PARTNER_COMPANY,
      SLOT_DATE,
      SLOT_TIME,
      TZ_LABEL,
      v(
        "statusSentence",
        "Phrase selon l'état de la demande",
        "Votre rendez-vous confirmé est annulé."
      ),
      DIRECTORY_URL,
    ],
    defaultSubject: "Votre rendez-vous du {{slotDate}} est annulé",
    defaultBlocks: [
      { id: "b1", type: "heading", text: "Bonjour {{firstName}}," },
      {
        id: "b2",
        type: "paragraph",
        text: "Le comité d'organisation a dû annuler le créneau du {{slotDate}}, à {{slotTime}} ({{timezoneLabel}}). {{statusSentence}}",
      },
      {
        id: "b3",
        type: "list",
        style: "bullet",
        items: ["Avec : {{partnerName}}, {{partnerCompany}}", "Événement : {{eventTitle}}"],
      },
      {
        id: "b4",
        type: "paragraph",
        text: "Nous vous prions de nous excuser pour ce changement. Vous pouvez reprendre rendez-vous sur un autre créneau.",
      },
      { id: "b5", type: "button", label: "Voir les participants", url: "{{directoryUrl}}" },
      ...CLOSING,
    ],
  },
];
