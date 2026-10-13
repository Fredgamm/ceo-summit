# Specification produit - RDV evenement B2B

## 1. Vision produit

Ce document decrit le module de rendez-vous B2B a reconstruire dans une application React autonome avec API dediee.

Le plugin WordPress `b2b-ceo-summit` sert uniquement de reference fonctionnelle legacy. La cible ne doit pas dependre de WordPress : pas de shortcode, pas de template PHP, pas d'action AJAX WordPress, pas de `wp-admin` pour le parcours evenement.

Le module permet :

- a l'admin de creer un evenement B2B RDV dedie ;
- a l'admin de generer et publier des creneaux ;
- aux participants de gerer leurs disponibilites ;
- aux participants de demander, accepter ou refuser un rendez-vous ;
- aux participants de consulter leurs rendez-vous ;
- a l'organisation de suivre les rendez-vous, relances, exports et absences.

## 2. Notes globales d'integration

### 2.1 Evenement B2B RDV dedie

L'evenement B2B RDV n'est pas le meme objet que les evenements deja existants dans la plateforme.

Il faut separer clairement :

- les evenements generaux de la plateforme ;
- l'evenement B2B RDV dedie au networking ;
- les creneaux RDV ;
- les rendez-vous entre deux participants.

### 2.2 Salle ou zone B2B dediee

La salle ou zone B2B RDV est obligatoire pour que les participants se retrouvent facilement.

Elle ne doit pas etre confondue avec les salles deja existantes dans la plateforme.

Informations attendues :

- lieu principal ;
- salle, zone ou espace RDV B2B ;
- indications d'acces.

La capacite de salle n'est pas necessaire pour le MVP, car la plateforme ne gere ni les tables ni l'occupation physique. Elle peut rester une option future de reporting si l'organisation en exprime le besoin.

### 2.3 Aucune liaison avec les tables

La plateforme n'a aucune liaison avec les tables.

Elle ne doit pas creer, stocker, assigner, afficher ou suivre des tables.

Le suivi se fait uniquement au niveau evenement, salle/zone, creneau et participants.

### 2.4 Mes creneaux vs Mes rendez-vous

`Mes creneaux` et `Mes rendez-vous` sont deux espaces differents.

- `Mes creneaux` (`/account/slots`) : gerer ses disponibilites personnelles.
- `Mes rendez-vous` (`/account/bookings`) : consulter les demandes et rendez-vous avec les autres participants.

Ces deux parcours ne doivent pas etre melanges.

## 3. Acteurs

### Admin evenement

Responsable de :

- creer l'evenement B2B RDV ;
- definir la salle ou zone RDV ;
- generer les creneaux ;
- publier les creneaux ;
- suivre les rendez-vous ;
- relancer les demandes en attente ;
- exporter les donnees ;
- traiter les signalements d'absence.

### Participant

Responsable de :

- completer son profil minimum ;
- gerer ses creneaux ;
- demander un rendez-vous ;
- accepter ou refuser une demande recue ;
- consulter ses rendez-vous ;
- ajouter un rendez-vous confirme a son calendrier ;
- signaler une absence si cette option est activee.

### Systeme

Responsable de :

- proteger les actions sensibles ;
- eviter les doubles reservations ;
- expirer les demandes sans reponse apres 48h ;
- liberer automatiquement les deux creneaux apres expiration/refus ;
- envoyer les emails transactionnels ;
- generer les fichiers ICS ;
- journaliser les actions importantes.

## 4. Regles metier globales

### 4.1 Requis minimum participant

Un participant doit avoir au minimum :

- compte actif ;
- nom et prenom ;
- entreprise ;
- numero de telephone ;
- email valide ;
- profil visible ou valide par l'organisation ;
- participation validee a l'evenement ;
- creneaux distribues pour l'evenement.

### 4.2 Confidentialite telephone

Le numero de telephone n'est jamais affiche avant confirmation du rendez-vous.

Regles :

- demande `pending` : pas de telephone ;
- demande `declined` : pas de telephone ;
- demande `expired` : pas de telephone ;
- rendez-vous `confirmed` : telephone visible aux deux participants ;
- rendez-vous `completed` : telephone visible si le rendez-vous etait confirme.

L'API ne doit pas renvoyer le telephone si l'utilisateur n'a pas le droit de le voir.

### 4.3 Rendez-vous entre deux personnes

Un rendez-vous concerne exactement deux participants :

- User A : demandeur ;
- User B : destinataire.

User A ne peut pas demander un rendez-vous avec lui-meme.

### 4.4 Expiration 48h

Si User B ne repond pas pendant 48 heures :

- le booking passe en `expired` ;
- le creneau de User B redevient `available` ;
- le creneau miroir de User A redevient `available` s'il avait ete bloque ;
- les tokens accepter/refuser deviennent invalides ;
- les deux participants peuvent etre notifies.

### 4.5 Etats principaux

Bookings :

- `pending` : demande envoyee, en attente de reponse ;
- `confirmed` : rendez-vous accepte ;
- `declined` : rendez-vous refuse ;
- `expired` : demande expiree apres 48h sans reponse ;
- `cancelled` : rendez-vous annule ;
- `completed` : rendez-vous passe/termine ;
- `no_show` : absence signalee.

Creneaux participant :

- `available` : libre ;
- `pending` : bloque par une demande en attente ;
- `booked` : reserve par un rendez-vous confirme ;
- `unavailable` : indisponible/inactif.

## 5. Modeles metier cible

### Event

```ts
type Event = {
  id: number;
  title: string;
  type: "physical_b2b_meeting";
  description: string;
  dateStart: string;
  dateEnd: string;
  venueName: string;
  venueAddress?: string;
  meetingAreaName: string;
  meetingAreaDirections: string;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
};
```

### EventTimeSlot

```ts
type EventTimeSlot = {
  id: number;
  eventId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: "draft" | "published" | "closed";
};
```

### ParticipantSlot

```ts
type ParticipantSlot = {
  id: number;
  eventId: number;
  participantId: number;
  eventTimeSlotId: number;
  active: boolean;
  status: "available" | "pending" | "booked" | "unavailable";
  bookingId?: number | null;
};
```

### Booking

```ts
type Booking = {
  id: number;
  eventId: number;
  hostId: number;
  guestId: number;
  participantSlotId: number;
  eventTimeSlotId: number;
  message: string;
  status: "pending" | "confirmed" | "declined" | "expired" | "cancelled" | "completed" | "no_show";
  decisionTokenExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

## 6. Parcours 1 - Admin cree l'evenement et publie les creneaux

### Objectif

Creer un evenement B2B physique, definir la salle ou zone RDV, generer les creneaux, les verifier, puis les publier aux participants eligibles.

### Cas 1.1 - Creer l'evenement

L'admin renseigne :

- titre ;
- type `physical_b2b_meeting` ;
- description ;
- date ou plage de dates ;
- lieu ;
- salle ou zone RDV obligatoire ;
- indications pour retrouver la salle ;
- statut `draft` ou `published`.

User stories :

- En tant qu'admin, je veux creer un evenement B2B RDV afin de preparer la phase networking.
- En tant qu'admin, je veux definir une salle/zone obligatoire afin que les participants sachent ou se presenter.
- En tant qu'admin, je veux ajouter des indications d'acces afin que les participants retrouvent facilement l'espace RDV.

Regles :

- l'evenement B2B RDV est separe des evenements generaux de la plateforme ;
- la salle B2B RDV est separee des salles generales de la plateforme ;
- aucune table n'est geree par la plateforme ;
- un evenement en brouillon ne distribue aucun creneau.

### Cas 1.2 - Definir la grille de creneaux

L'admin configure :

- date de debut ;
- date de fin ;
- heure de debut journaliere ;
- heure de fin journaliere ;
- duree d'un creneau, par exemple 30 minutes ;
- pause optionnelle ;
- pause en heures ou minutes ;
- dates exclues si besoin.

User stories :

- En tant qu'admin, je veux choisir la duree des creneaux afin d'adapter le rythme des rencontres.
- En tant qu'admin, je veux definir une pause afin d'exclure le dejeuner ou une indisponibilite.
- En tant qu'admin, je veux previsualiser la grille afin d'eviter les erreurs.

Regles :

- l'heure de fin doit etre apres l'heure de debut ;
- un creneau ne doit pas chevaucher une pause ;
- la pause en heures est convertie en minutes cote API ;
- apres publication, toute modification doit verifier les bookings existants.

### Cas 1.3 - Generer les creneaux

Le systeme cree :

- des `EventTimeSlot` globaux ;
- des `ParticipantSlot` distribues aux participants eligibles apres publication.

Regles :

- un creneau global represente un horaire de l'evenement ;
- un creneau participant represente la disponibilite d'un participant sur cet horaire ;
- les participants devenant eligibles apres publication recoivent automatiquement les creneaux publies ;
- aucune table n'est creee ni assignee.

### Cas 1.4 - Gerer avant publication

L'admin peut :

- voir les creneaux par date ;
- supprimer un creneau ;
- desactiver un creneau ;
- ajouter un creneau manuel ;
- regenerer la grille ;
- voir le nombre total de creneaux ;
- voir le nombre de participants eligibles.

### Cas 1.5 - Publier et distribuer

Quand l'admin publie :

1. l'evenement passe en `published` ;
2. les creneaux globaux passent en `published` ;
3. le systeme identifie les participants eligibles ;
4. le systeme cree les creneaux participant ;
5. les participants peuvent gerer leurs disponibilites.

### Criteres d'acceptation

- L'admin peut creer un evenement B2B RDV dedie.
- La salle/zone RDV est obligatoire.
- Les indications d'acces sont renseignees.
- La plateforme ne gere aucune table.
- L'admin peut generer une grille de creneaux.
- L'admin peut previsualiser et modifier avant publication.
- La publication distribue les creneaux aux participants eligibles.

## 7. Parcours 2 - Utilisateur demande un rendez-vous

### Objectif

Permettre a User A de demander un rendez-vous avec User B sur un creneau disponible.

### Acteurs

- User A : demandeur ;
- User B : destinataire ;
- Admin : suivi organisationnel ;
- Systeme : emails, tokens, expiration.

### Cas 2.1 - User A consulte l'annuaire

Parcours :

1. User A ouvre `/directory`.
2. React affiche les participants visibles et eligibles.
3. User A recherche par nom, entreprise ou secteur.
4. User A ouvre le profil public de User B.

User stories :

- En tant que User A, je veux voir la liste des membres afin d'identifier les personnes a rencontrer.
- En tant que User A, je veux rechercher par entreprise, nom ou secteur afin de trouver rapidement un contact pertinent.

### Cas 2.2 - User A consulte le profil public

Parcours :

1. React charge `/members/:memberId`.
2. React verifie que User A est connecte et eligible.
3. React verifie que User A n'est pas User B.
4. React affiche l'action `Demander un rendez-vous` ou `Voir les creneaux B2B`.
5. React affiche le planning RDV de User B.

Regles :

- un membre peut voir les creneaux deja reserves ;
- les creneaux reserves/en attente sont visibles mais non selectionnables ;
- seuls les creneaux `available` sont cliquables ;
- si aucun creneau n'est libre, afficher le planning reserve/en attente avec un message clair.

### Cas 2.3 - User A choisit un creneau

Regles :

- le creneau doit etre `available` ;
- le creneau doit appartenir a User B ;
- User A ne doit pas etre occupe au meme horaire ;
- User B ne doit pas etre occupe au meme horaire ;
- le motif est obligatoire ;
- le motif doit respecter une longueur min/max.

User stories :

- En tant que User A, je veux voir le planning de User B afin de comprendre ses disponibilites.
- En tant que User A, je veux expliquer le motif afin que User B comprenne l'interet de la rencontre.

### Cas 2.4 - User A envoie la demande

Parcours :

1. User A clique sur `Envoyer la demande`.
2. React desactive le bouton pour eviter le double clic.
3. React envoie `POST /api/bookings`.
4. L'API revalide toutes les regles.
5. L'API cree un booking `pending`.
6. L'API passe le creneau de User B en `pending`.
7. L'API peut bloquer temporairement le creneau miroir de User A en `pending`.
8. L'API cree les tokens accepter/refuser.
9. L'API envoie l'email a User B.

Regles anti double clic :

- bouton desactive cote React ;
- `Idempotency-Key` cote API ;
- refus d'une demande identique active ;
- creation en transaction.

### Email 2.A - Demande envoyee a User B

Objet :

`Nouvelle demande de rendez-vous B2B - {Entreprise User A}`

Contenu :

```text
Bonjour {prenom User B},

Vous avez recu une demande de rendez-vous pour la session Networking du CEO Summit.
{prenom User A} {nom User A}, de {entreprise User A}, souhaite vous rencontrer pendant {titre evenement}.

Demandeur :
- Nom : {prenom User A} {nom User A}
- Entreprise : {entreprise User A}
- Fonction : {fonction User A}

Les coordonnees directes, comme le numero de telephone, ne sont partagees qu'apres confirmation du rendez-vous.

Evenement :
- Titre : {titre evenement}
- Lieu : {lieu evenement}
- Espace RDV : {zone ou salle B2B}
- Indications : {indications pour retrouver la salle}

Creneau demande :
- Date : {date}
- Heure : {heure debut} - {heure fin}

Motif de la demande :
{message User A}

Actions :
- Voir le profil : {lien profil public User A}
- Accepter le rendez-vous : {lien token accept}
- Decliner le rendez-vous : {lien token decline}

Ces liens sont personnels, securises et utilisables une seule fois.
Sans reponse avant {date expiration}, la demande pourra expirer automatiquement.

Le comite d'organisation vous remercie.

Cordialement,
L'equipe CEO Summit Indian Ocean

Notification automatique - Plateforme Networking CEO Summit
```

### Cas 2.5 - User B accepte

Parcours :

1. User B clique sur `Accepter`.
2. L'API verifie token/session.
3. L'API verifie que le booking est `pending`.
4. L'API verifie les conflits horaires.
5. L'API passe le booking en `confirmed`.
6. L'API passe les creneaux User A et User B en `booked`.
7. L'API invalide le token.
8. L'API envoie les emails de confirmation aux deux participants.
9. L'API envoie un email admin de suivi.

Regles token :

- token long et non devinable ;
- token stocke hashe ;
- token lie au booking et a l'action ;
- token utilisable une seule fois ;
- token invalide si booking deja traite ou expire.

### Emails de confirmation participants

Les emails de confirmation incluent :

- evenement ;
- lieu ;
- salle/zone RDV ;
- indications ;
- date et heure ;
- nom, entreprise, fonction du partenaire ;
- telephone du partenaire ;
- email du partenaire ;
- lien profil ;
- motif ;
- lien ICS.

Footer :

```text
Le comite d'organisation vous remercie.

Cordialement,
L'equipe CEO Summit Indian Ocean

Notification automatique - Plateforme Networking CEO Summit
```

### Email admin apres confirmation

L'email admin inclut :

- ID booking ;
- evenement ;
- salle/zone RDV ;
- date et heure ;
- demandeur : nom, entreprise, email, telephone ;
- destinataire : nom, entreprise, email, telephone ;
- motif ;
- informations utiles au suivi terrain.

Il ne contient aucune donnee table.

### Cas 2.6 - User B refuse

Parcours :

1. User B clique sur `Decliner`.
2. L'API verifie token/session.
3. L'API passe le booking en `declined`.
4. L'API libere le creneau de User B.
5. L'API libere le creneau miroir de User A s'il avait ete bloque.
6. L'API envoie un email a User A.

### Cas 2.7 - Expiration 48h

Si User B ne repond pas pendant 48h :

- booking passe en `expired` ;
- creneau User B libere ;
- creneau miroir User A libere ;
- tokens invalides ;
- emails expiration possibles.

### Criteres d'acceptation

- User A ne peut pas demander un rendez-vous avec lui-meme.
- Le motif est obligatoire.
- Le double clic ne cree jamais deux bookings.
- Une demande cree un booking `pending`.
- User B recoit un email avec profil, motif, creneau et boutons accepter/decliner.
- Le token email est utilisable une seule fois.
- L'acceptation confirme le booking et bloque les deux creneaux.
- Le refus libere les deux creneaux.
- Sans reponse pendant 48h, le booking expire et les deux creneaux sont liberes.

## 8. Parcours 3 - Utilisateur consulte Mes rendez-vous

### Objectif

Permettre a chaque participant de suivre ses demandes et rendez-vous dans `/account/bookings`.

Ce parcours ne gere pas les disponibilites personnelles. Cela appartient a `Mes creneaux`.

### Cas 3.1 - Afficher la liste

Chaque carte affiche :

- date ;
- heure ;
- entreprise du partenaire ;
- nom et prenom du partenaire ;
- statut ;
- role courant : demandeur ou destinataire ;
- motif ;
- salle/zone B2B ;
- indications.

Telephone :

- visible uniquement si `confirmed` ou `completed` ;
- masque si `pending`, `declined`, `expired` ou `cancelled`.

### Cas 3.2 - Filtrer

Filtres :

- `Tous` ;
- `En attente` ;
- `Confirmes` ;
- `Passes` si historique active ;
- `Refuses` ;
- `Expires` ;
- `Annules` si utilise.

### Cas 3.3 - Actions par statut

Demande recue `pending` :

- accepter ;
- decliner ;
- voir profil ;
- telephone masque.

Demande envoyee `pending` :

- statut `En attente de reponse` ;
- telephone masque ;
- pas d'action accepter/refuser.

Rendez-vous `confirmed` :

- telephone visible ;
- lien ICS ;
- profil partenaire ;
- salle/zone et indications.

Rendez-vous `declined` ou `expired` :

- telephone masque ;
- creneau libere ;
- lien annuaire/profil si utile.

Rendez-vous passe :

- statut `Passe` ou `Termine` ;
- action no-show si active.

### API

`GET /api/me/bookings`

Parametres :

- `status=all|pending|confirmed|past|declined|expired|cancelled`
- `eventId`
- `dateFrom`
- `dateTo`

Regle API :

- `partner.phone = null` si `canViewPartnerPhone = false`.

### Criteres d'acceptation

- L'utilisateur peut voir tous ses rendez-vous depuis `/account/bookings`.
- L'utilisateur peut filtrer par statut.
- Date, heure, entreprise et nom sont visibles.
- Telephone visible seulement apres confirmation.
- Les demandes recues affichent accepter/refuser.
- Les rendez-vous confirmes affichent le lien calendrier.

## 9. Parcours 4 - Utilisateur gere Mes creneaux

### Objectif

Permettre a un participant de gerer ses disponibilites dans `/account/slots`.

### Cas 4.1 - Consulter ses creneaux

React affiche :

- creneaux groupes par date ;
- statut libre, en attente, reserve, indisponible, passe ;
- compteurs total, actifs, inactifs, reserves.

### Cas 4.2 - Activer/desactiver un creneau

Regles :

- le creneau doit appartenir a l'utilisateur ;
- un creneau reserve ne peut pas etre modifie ;
- un creneau passe ne peut pas etre modifie ;
- un creneau actif peut recevoir des demandes ;
- un creneau inactif n'est pas selectionnable sur le profil public.

### Cas 4.3 - Activer/masquer tous les creneaux

Regles :

- `slotsActive = true` : disponibilites visibles ;
- `slotsActive = false` : disponibilites masquees ;
- masquer les creneaux n'annule aucun rendez-vous confirme.

### API

- `GET /api/me/slots`
- `PATCH /api/me/slots/:slotId`
- `PATCH /api/me/slots`

### Criteres d'acceptation

- `Mes creneaux` est separe de `Mes rendez-vous`.
- L'utilisateur peut activer/desactiver un creneau libre.
- Un creneau reserve ou passe ne peut pas etre modifie.
- Masquer globalement les disponibilites n'annule aucun rendez-vous.

## 10. Parcours 5 - Ajouter au calendrier personnel

### Objectif

Permettre aux participants d'ajouter un rendez-vous confirme a leur calendrier.

### Declencheurs

- email de confirmation ;
- page `Mes rendez-vous` ;
- detail rendez-vous.

### Regles ICS

Disponible uniquement pour `confirmed` ou `completed`.

Le fichier contient :

- titre ;
- date/heure debut ;
- date/heure fin ;
- lieu ;
- salle/zone ;
- indications ;
- participants ;
- entreprises ;
- motif.

### API

`GET /api/bookings/:bookingId/ics`

### Criteres d'acceptation

- Lien calendrier visible seulement sur rendez-vous confirme/termine.
- ICS securise.
- ICS contient les informations utiles au participant.

## 11. Parcours 6 - Signaler une absence

### Objectif

Permettre a un participant de signaler qu'un autre participant ne s'est pas presente.

### Conditions

- rendez-vous confirme ;
- rendez-vous passe ;
- utilisateur participant du rendez-vous ;
- signalement non deja envoye.

### Parcours

1. L'utilisateur ouvre `Mes rendez-vous`.
2. Il consulte les rendez-vous passes.
3. Il clique sur `Signaler une absence`.
4. React envoie `POST /api/bookings/:id/no-show`.
5. L'API cree une reclamation.
6. L'admin voit le signalement.

### API

- `POST /api/bookings/:id/no-show`
- `GET /api/admin/claims`
- `PATCH /api/admin/claims/:id`

### Criteres d'acceptation

- No-show disponible seulement sur rendez-vous confirme passe.
- Un seul signalement par participant et par rendez-vous.
- L'admin peut traiter le signalement.

## 12. Parcours 7 - Admin supervise, relance et exporte

### Objectif

Permettre a l'organisation de suivre les rendez-vous et de produire les exports terrain.

### Routes

- `/admin/bookings`
- `/admin/claims`
- `/admin/exports`

### Cas 7.1 - Consulter tous les rendez-vous

Informations :

- ID booking ;
- statut ;
- date et heure ;
- evenement ;
- salle/zone ;
- demandeur ;
- destinataire ;
- emails ;
- telephones ;
- motif ;
- date de creation ;
- derniere mise a jour.

### Cas 7.2 - Relancer une demande en attente

Regles :

- seulement sur booking `pending` ;
- ne prolonge pas automatiquement le delai 48h ;
- envoie un rappel au destinataire.

### Cas 7.3 - Exporter

Formats :

- CSV ;
- XLSX ;
- PDF imprimable si necessaire.

Filtres :

- tous ;
- confirmes ;
- en attente ;
- refuses ;
- expires ;
- no-show ;
- date ;
- evenement.

### Cas 7.4 - Traiter les reclamations

Statuts :

- `open` ;
- `transmitted` ;
- `resolved`.

### API

- `GET /api/admin/bookings`
- `POST /api/admin/bookings/:id/remind`
- `GET /api/admin/bookings/export`
- `GET /api/admin/claims`
- `PATCH /api/admin/claims/:id`

### Criteres d'acceptation

- Admin peut filtrer les rendez-vous.
- Admin peut relancer une demande pending.
- Admin peut exporter.
- Admin peut traiter les reclamations.
- Actions admin journalisees.

## 13. Parcours 8 - Automatisations systeme

### Expiration 48h

Job regulier :

- detecte bookings `pending` > 48h ;
- passe en `expired` ;
- libere les deux creneaux ;
- invalide les tokens ;
- envoie emails si active.

### Passage en termine

Job ou calcul dynamique :

- detecte rendez-vous `confirmed` dont l'heure de fin est passee ;
- passe en `completed` ou affiche comme passe ;
- conserve l'historique.

### Nettoyage incoherences

Job :

- detecte creneaux bloques sans booking actif ;
- libere les creneaux lies a booking refuse, expire, annule ou inexistant ;
- journalise la correction.

### Criteres d'acceptation

- Expiration 48h automatique.
- Deux creneaux liberes apres expiration.
- Rendez-vous passes visibles comme termines.
- Creneaux incoherents nettoyes.
- Jobs journalises.

## 14. Emails transactionnels

### Expediteur recommande

- Nom : `B2B CEO Summit`
- Email : `noreply@ceo-summit.mg`

### Entete email basique

Base reprise des emails existants du plugin :

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div
    style="background: linear-gradient(135deg, #004aad 0%, #003b8b 100%); padding: 30px; text-align: center;"
  >
    <h1 style="color: white; margin: 0; font-size: 24px;">CEO Summit - Networking B2B</h1>
  </div>

  <div style="padding: 30px; background: #ffffff;">
    <!-- Contenu email -->
  </div>
</div>
```

Variante possible pour les emails d'accueil ou d'information generale :

```html
<div class="header">
  <h1>Bienvenue au B2B CEO Summit</h1>
  <p>Votre espace membre est pret</p>
</div>
```

Pour les emails RDV, utiliser par defaut :

- titre entete : `CEO Summit - Networking B2B` ;
- fond : degrade bleu `#004aad` vers `#003b8b` ;
- contenu : bloc blanc avec padding `30px`.

### Footer participant

```text
Le comite d'organisation vous remercie.

Cordialement,
L'equipe CEO Summit Indian Ocean

Notification automatique - Plateforme Networking CEO Summit
```

### Footer admin

```text
Notification automatique - Plateforme Networking CEO Summit
```

### Footer HTML basique

Base reprise des emails de rendez-vous existants :

```html
<p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
  Cordialement,<br />
  <strong>L'equipe <br />CEO Summit Indian Ocean</strong>
</p>

<div
  style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b;"
>
  <p style="margin: 0;">
    Cet email a ete envoye automatiquement par la plateforme Networking CEO Summit.
  </p>
</div>
```

Variante footer general existant :

```html
<div class="footer">
  <p>
    <strong>Besoin d'aide ?</strong><br />
    Contactez-nous a <a href="mailto:support@ceo-summit.com">support@ceo-summit.com</a>
  </p>
  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
    © 2025 CEO Summit. Tous droits reserves.
  </p>
</div>
```

Pour les emails RDV, utiliser le footer automatique Networking CEO Summit.

### Emails requis

- demande envoyee a User B ;
- confirmation a User A ;
- confirmation a User B ;
- notification admin apres confirmation ;
- refus a User A ;
- expiration a User A ;
- expiration a User B ;
- rappel demande pending ;
- notification no-show admin.

## 15. Endpoints API recapitulatif

### Participants

- `GET /api/events/:eventId/participants`
- `GET /api/events/:eventId/participants/:participantId`

### Creneaux

- `GET /api/events/:eventId/participants/:participantId/slots`
- `GET /api/me/slots`
- `PATCH /api/me/slots/:slotId`
- `PATCH /api/me/slots`
- `POST /api/admin/events/:eventId/slots/generate`

### Rendez-vous

- `POST /api/bookings`
- `GET /api/me/bookings`
- `POST /api/bookings/:bookingId/accept`
- `POST /api/bookings/:bookingId/decline`
- `GET /api/booking-decisions`
- `GET /api/bookings/:bookingId/ics`
- `POST /api/bookings/:id/no-show`

### Admin

- `GET /api/admin/bookings`
- `POST /api/admin/bookings/:id/remind`
- `GET /api/admin/bookings/export`
- `GET /api/admin/claims`
- `PATCH /api/admin/claims/:id`

## 16. Codes erreur front

- `AUTH_REQUIRED` : utilisateur non connecte.
- `PROFILE_INCOMPLETE` : profil courant incomplet.
- `TARGET_PROFILE_UNAVAILABLE` : membre cible non disponible.
- `SELF_BOOKING_NOT_ALLOWED` : rendez-vous avec soi-meme interdit.
- `SLOT_NOT_FOUND` : creneau introuvable.
- `SLOT_INACTIVE` : creneau desactive.
- `SLOT_PAST` : creneau passe.
- `SLOT_UNAVAILABLE` : creneau deja pris.
- `USER_TIME_CONFLICT` : conflit horaire.
- `BOOKING_NOT_FOUND` : rendez-vous introuvable.
- `BOOKING_ALREADY_PROCESSED` : demande deja traitee.
- `NOT_BOOKING_HOST` : seul le destinataire peut accepter/refuser.
- `TOKEN_INVALID` : token invalide.
- `TOKEN_EXPIRED` : token expire.
- `NO_SHOW_ALREADY_REPORTED` : absence deja signalee.
- `SERVER_ERROR` : erreur technique.

## 17. Permissions et securite

Le backend doit toujours verifier :

- authentification ;
- profil minimum ;
- droit admin ;
- proprietaire du creneau ;
- participant du booking ;
- destinataire du booking pour accepter/refuser ;
- statut actuel du booking ;
- conflit horaire ;
- expiration token ;
- droits de voir le telephone ;
- idempotence creation booking ;
- journalisation des actions sensibles.

## 18. Questions produit ouvertes

- Le filtre `Passes` doit-il etre affiche par defaut dans `Mes rendez-vous` ?
- Le statut `completed` est-il stocke en base ou calcule dynamiquement ?
- Le no-show est-il active des la premiere version React ?
- Les rappels admin prolongent-ils ou non le delai 48h ?
- Quel service email sera utilise : Brevo, SMTP, Sendgrid ou autre ?
- Quel backend portera l'API cible ?
- Faut-il migrer les donnees legacy du plugin ?

## 19. References legacy

Fichiers du plugin actuel utilises comme reference fonctionnelle :

- `includes/class-b2b-slots.php` : creneaux ;
- `includes/class-b2b-bookings.php` : demandes, acceptation, refus, ICS, expiration ;
- `includes/class-b2b-mybookings.php` : mes rendez-vous, no-show ;
- `includes/class-b2b-claims.php` : reclamations ;
- `includes/class-b2b-admin.php` : admin, exports, relances ;
- `templates/profile-public.php` : profil public et demande RDV ;
- `templates/profile-page.php` : espace profil, rendez-vous, creneaux.
