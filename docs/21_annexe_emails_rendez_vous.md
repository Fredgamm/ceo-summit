# Module 21 — Annexe : les emails des rendez-vous B2B

> **Statut :** à relire et valider avant le codage du lot 7. Aucun de ces emails n'est encore dans la plateforme.
> **Date :** 3 novembre 2026
> **Légende :**
> ✅ **Texte du client** — repris de `doc-rdv-evenement.md`, sans changement de fond.
> ✏️ **Projet à valider** — rédigé pour cette annexe, le client n'a fourni que la liste des champs ou rien du tout.
>
> **Variables** (entre doubles accolades) : remplacées à l'envoi. Une fois dans la plateforme, chaque email se modifie dans **Admin → Emails**, sans développement.
> **Mise en forme :** gabarit de la plateforme (bleu marine et or), pas l'en-tête dégradé du plugin (décision D9). Expéditeur : `noreply@ceo-summit.mg`.

## Sommaire

| #   | Email                                 | Destinataire         | Déclencheur                          | Texte | Phase |
| --- | ------------------------------------- | -------------------- | ------------------------------------ | ----- | ----- |
| 1   | Nouvelle demande de rendez-vous       | Destinataire         | Une demande est envoyée              | ✅    | V1    |
| 2   | Rendez-vous confirmé                  | Demandeur            | La demande est acceptée              | ⚠️ ✏️ | V1    |
| 3   | Rendez-vous confirmé                  | Destinataire         | La demande est acceptée              | ⚠️ ✏️ | V1    |
| 4   | Demande refusée                       | Demandeur            | La demande est refusée               | ✏️    | V1    |
| 5   | Demande expirée                       | Demandeur            | Sans réponse à l'échéance            | ✏️    | V1    |
| 6   | Demande expirée                       | Destinataire         | Sans réponse à l'échéance            | ✏️    | V1    |
| 7   | Vos créneaux sont ouverts             | Participant          | Publication, ou nouvelle inscription | ✏️    | V1    |
| 8   | Rendez-vous annulé par l'organisation | Personnes concernées | L'admin désactive un créneau         | ✏️    | V1    |
| 9   | Notification de confirmation          | Admin                | Un rendez-vous est confirmé          | ⚠️ ✏️ | V2    |
| 10  | Rappel d'une demande en attente       | Destinataire         | Relance par l'admin                  | ✏️    | V2    |
| 11  | Absence signalée                      | Admin                | Un participant signale une absence   | ✏️    | V2    |

⚠️ = le client a donné la liste des champs à faire figurer, pas le texte. Le texte ci-dessous est un projet qui respecte cette liste.

## Éléments communs

**Pied de page participant** ✅ (emails 1 à 8, 10) :

```text
Le comité d'organisation vous remercie.

Cordialement,
L'équipe CEO Summit Indian Ocean

Notification automatique - Plateforme Networking CEO Summit
```

**Pied de page admin** ✅ (emails 9 et 11) :

```text
Notification automatique - Plateforme Networking CEO Summit
```

**Fichier calendrier** : les emails 2 et 3 portent le fichier `.ics` en pièce jointe et un lien « Ajouter à Google Agenda ».
**Téléphone** : il n'apparaît que dans les emails de confirmation (2, 3, 9), jamais avant (règle RG-04).

---

## 1. Nouvelle demande de rendez-vous ✅ (V1)

**À** : le destinataire · **Objet** : `Nouvelle demande de rendez-vous B2B - {{requesterCompany}}`

```text
Bonjour {{recipientFirstName}},

Vous avez reçu une demande de rendez-vous pour la session Networking du CEO Summit.
{{requesterName}}, de {{requesterCompany}}, souhaite vous rencontrer pendant {{eventTitle}}.

Demandeur :
- Nom : {{requesterName}}
- Entreprise : {{requesterCompany}}
- Fonction : {{requesterTitle}}

Les coordonnées directes, comme le numéro de téléphone, ne sont partagées qu'après confirmation du rendez-vous.

Événement :
- Titre : {{eventTitle}}
- Lieu : {{eventLocation}}
- Espace RDV : {{zone}}
- Indications : {{accessInstructions}}

Créneau demandé :
- Date : {{slotDate}}
- Heure : {{slotTime}} ({{timezoneLabel}})

Motif de la demande :
{{reason}}

Actions :
- Voir le profil : {{requesterProfileUrl}}
- Répondre à la demande : {{myMeetingsUrl}}

Sans réponse avant {{expiresAt}}, la demande pourra expirer automatiquement.
```

- pied de page participant.

> **Écart avec le texte du client :** il prévoit deux liens directs « Accepter » et « Décliner » dans l'email. La spec (D10) les place en V2, avec une page de confirmation (les antivirus ouvrent parfois les liens des emails et déclencheraient une réponse sans que la personne l'ait voulu). En V1, un seul lien **« Répondre à la demande »** mène à « Mes rendez-vous ». Tout le reste du texte est celui du client.

---

## 2. Rendez-vous confirmé — au demandeur ⚠️ ✏️ (V1)

**À** : le demandeur · **Objet** : `Rendez-vous confirmé avec {{partnerName}} - {{slotDate}}, {{slotTime}}`
**Pièce jointe** : `rendez-vous-ceo-summit.ics`

```text
Bonjour {{firstName}},

{{partnerName}} a accepté votre demande de rendez-vous. Votre rencontre est confirmée.

Rendez-vous :
- Événement : {{eventTitle}}
- Lieu : {{eventLocation}}
- Espace RDV : {{zone}}
- Indications : {{accessInstructions}}
- Date : {{slotDate}}
- Heure : {{slotTime}} ({{timezoneLabel}})

Votre interlocuteur :
- Nom : {{partnerName}}
- Entreprise : {{partnerCompany}}
- Fonction : {{partnerTitle}}
- Téléphone : {{partnerPhone}}
- Email : {{partnerEmail}}
- Profil : {{partnerProfileUrl}}

Motif de la rencontre :
{{reason}}

Ajouter à votre agenda :
- Fichier calendrier : en pièce jointe, ou {{icsUrl}}
- Google Agenda : {{googleCalendarUrl}}
```

- pied de page participant.

## 3. Rendez-vous confirmé — au destinataire ⚠️ ✏️ (V1)

**À** : le destinataire · **Objet** : `Rendez-vous confirmé avec {{partnerName}} - {{slotDate}}, {{slotTime}}`
**Pièce jointe** : `rendez-vous-ceo-summit.ics`

```text
Bonjour {{firstName}},

Vous avez accepté la demande de rendez-vous de {{partnerName}}. Votre rencontre est confirmée.

[mêmes blocs « Rendez-vous », « Votre interlocuteur », « Motif » et « Ajouter à votre agenda » que l'email 2]
```

- pied de page participant.

> Les champs listés par le client pour les deux emails de confirmation : événement, lieu, salle/zone, indications, date et heure, nom, entreprise et fonction du partenaire, téléphone, email, lien profil, motif, lien ICS. Ils sont tous présents.

---

## 4. Demande refusée ✏️ (V1)

**À** : le demandeur · **Objet** : `Votre demande de rendez-vous n'a pas été retenue - {{partnerCompany}}`

```text
Bonjour {{firstName}},

{{partnerName}}, de {{partnerCompany}}, n'a pas pu donner suite à votre demande de rendez-vous du {{slotDate}}, à {{slotTime}}.

Le créneau est de nouveau libre : vous pouvez proposer un autre horaire à cette personne, ou rencontrer d'autres participants du CEO Summit.

Voir les participants : {{directoryUrl}}
```

- pied de page participant.

> Le motif du refus n'est pas demandé ni transmis.

## 5. Demande expirée — au demandeur ✏️ (V1)

**À** : le demandeur · **Objet** : `Votre demande de rendez-vous est restée sans réponse - {{partnerCompany}}`

```text
Bonjour {{firstName}},

{{partnerName}}, de {{partnerCompany}}, n'a pas répondu à votre demande de rendez-vous du {{slotDate}}, à {{slotTime}}. La demande a donc expiré.

Le créneau est de nouveau libre. Vous pouvez renouveler votre demande ou en adresser une à un autre participant.

Voir les participants : {{directoryUrl}}
```

- pied de page participant.

## 6. Demande expirée — au destinataire ✏️ (V1)

**À** : le destinataire · **Objet** : `Une demande de rendez-vous a expiré - {{requesterCompany}}`

```text
Bonjour {{firstName}},

Vous n'avez pas répondu à la demande de rendez-vous de {{requesterName}}, de {{requesterCompany}}, pour le {{slotDate}} à {{slotTime}}. La demande a donc expiré et le créneau est de nouveau libre.

Si vous souhaitez tout de même rencontrer cette personne, vous pouvez lui proposer un créneau depuis son profil : {{requesterProfileUrl}}
```

- pied de page participant.

---

## 7. Vos créneaux sont ouverts ✏️ (V1)

**À** : chaque participant éligible, à la publication des créneaux, ou à son inscription si elle a lieu après · **Objet** : `Vous participez aux rendez-vous B2B : vérifiez vos créneaux`

```text
Bonjour {{firstName}},

Vous participez aux rendez-vous B2B du {{eventTitle}}.

Les créneaux de rencontre sont ouverts. Ils sont tous actifs par défaut : les autres participants peuvent vous demander un rendez-vous dès maintenant. Désactivez simplement ceux où vous n'êtes pas disponible.

Rencontres :
- Espace RDV : {{zone}}
- Indications : {{accessInstructions}}
- Horaires affichés en {{timezoneLabel}}

Gérer mes créneaux : {{mySlotsUrl}}

Les demandes sont possibles jusqu'à la fin de l'événement. Votre numéro de téléphone n'est partagé qu'avec les personnes dont vous confirmez le rendez-vous.
```

- pied de page participant.

> Prérequis pour recevoir les demandes : un profil complet (nom, entreprise, téléphone, email). Si des champs manquent, l'email peut ajouter : « Votre profil est incomplet ({{missingFields}}) : complétez-le pour recevoir des demandes. »

## 8. Rendez-vous annulé par l'organisation ✏️ (V1)

**À** : le demandeur et le destinataire d'une demande ou d'un rendez-vous touché · **Objet** : `Votre rendez-vous du {{slotDate}} est annulé`

```text
Bonjour {{firstName}},

Le comité d'organisation a dû annuler le créneau du {{slotDate}}, à {{slotTime}}. {{statusSentence}}

- Avec : {{partnerName}}, {{partnerCompany}}
- Événement : {{eventTitle}}

Nous vous prions de nous excuser pour ce changement. Vous pouvez reprendre rendez-vous sur un autre créneau : {{directoryUrl}}
```

- pied de page participant.

> `{{statusSentence}}` : « Votre rendez-vous confirmé est annulé. » ou « Votre demande en attente est annulée. »
> Se produit aussi quand le gérant retire un participant de sa liste (règle RG-14).

---

## 9. Notification de confirmation à l'admin ⚠️ ✏️ (V2)

**À** : l'équipe d'organisation · **Objet** : `Rendez-vous B2B confirmé - {{requesterCompany}} / {{recipientCompany}}`

```text
Un rendez-vous B2B vient d'être confirmé.

- Référence : {{bookingId}}
- Événement : {{eventTitle}}
- Espace RDV : {{zone}}
- Date : {{slotDate}}
- Heure : {{slotTime}} ({{timezoneLabel}})

Demandeur :
- {{requesterName}}, {{requesterCompany}}
- Email : {{requesterEmail}}
- Téléphone : {{requesterPhone}}

Destinataire :
- {{recipientName}}, {{recipientCompany}}
- Email : {{recipientEmail}}
- Téléphone : {{recipientPhone}}

Motif :
{{reason}}
```

- pied de page admin. Aucune donnée de table (la règle du client : pas de tables).

## 10. Rappel d'une demande en attente ✏️ (V2)

**À** : le destinataire, sur relance de l'admin · **Objet** : `Rappel : une demande de rendez-vous attend votre réponse`

```text
Bonjour {{firstName}},

{{requesterName}}, de {{requesterCompany}}, attend votre réponse pour un rendez-vous le {{slotDate}}, à {{slotTime}}.

Répondre à la demande : {{myMeetingsUrl}}

Sans réponse avant {{expiresAt}}, la demande expirera. Ce rappel ne prolonge pas ce délai.
```

- pied de page participant.

## 11. Absence signalée ✏️ (V2)

**À** : l'équipe d'organisation · **Objet** : `Absence signalée - rendez-vous {{bookingId}}`

```text
{{reporterName}} ({{reporterCompany}}) signale que {{absentName}} ({{absentCompany}}) ne s'est pas présenté(e) au rendez-vous du {{slotDate}}, à {{slotTime}}, espace {{zone}}.

Commentaire :
{{comment}}

Traiter la réclamation : {{claimUrl}}
```

- pied de page admin.

---

## Points à valider

1. **Email 1 : un seul lien « Répondre »** en V1 au lieu de « Accepter / Décliner » (voir l'écart ci-dessus). D'accord ?
2. **Refus (4) et expirations (5, 6)** : le ton et la proposition de reprendre rendez-vous conviennent-ils ?
3. **Email 7** : doit-il aussi partir aux membres qui s'inscrivent après la publication ? (Proposé : oui.)
4. **Email 8** : doit-il partir aussi quand un gérant retire un participant ? (Proposé : oui.)
5. **Email admin (9)** : à quelle adresse l'envoyer ? Pas d'adresse d'organisation dédiée n'est configurée aujourd'hui.
6. **Heures** : toujours dans le fuseau de l'événement, avec sa mention (« heure de La Réunion »), jamais dans le fuseau du destinataire.
