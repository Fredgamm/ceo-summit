# Module 18 — Rendez-vous B2B physiques pendant un événement

> **Statut :** étude de faisabilité, **complétée par le module 21** (`conception/21_rdv_b2b_specification_integration.md`) le 8 octobre, qui la confronte à la spécification du client (`doc-rdv-evenement.md`). En cas d'écart, le module 21 fait foi : notamment **plus de tables**, des **créneaux networking rattachés à l'événement** (distincts du Programme) et une **grille de créneaux générée**. Le §4.9 (participants désignés par le gérant) reste valable ; le §4.2 (fuseau horaire) est élargi à un fuseau réglé par événement (module 21, D19).
> **Version :** 1.1 — précision du 2 octobre : les rendez-vous sont des **rencontres physiques**, dans des **salles réservées par CEO Summit**, organisées par **l'agenda de l'événement**.
> **Date :** 2 octobre 2026
> **Source :** cahier des charges fonctionnel du client (prise de rendez-vous entre participants d'un événement B2B)
> **Méthode :** parcours utilisateur reformulé étape par étape, règles de gestion numérotées, puis confrontation au code réel de `mvp-connect-simple` (après la phase P0 du module 17)

---

## 0. Vue d'ensemble

### 0.1 Ce que couvre ce module

- **Le but** : fixer à l'avance des rencontres en face à face entre membres, **pendant l'événement physique**.
- **Le lieu** : des salles que CEO Summit réserve à cet effet sur le lieu de l'événement.
- **L'organisation** : elle passe par **l'agenda rattaché à chaque événement**, celui que l'admin construit déjà dans `/admin/evenements/[id]/agenda`. L'admin y ajoute des plages « Rendez-vous B2B », chacune dans une salle réservée, avec un nombre de tables. Ces plages sont découpées en créneaux, que les participants réservent entre eux.

### 0.2 Ce que ce module n'est pas

- **Pas le Deal Room.** Aucune opportunité ni demande de contact n'est en jeu. Le seul point commun est technique : le cycle « demande → acceptée ou refusée » est le même schéma de code.
- **Pas les salles thématiques de la plateforme** (`/salles`, modèle `Room`). Ce sont des salons de discussion en ligne, en temps réel. Ici, une « salle » est un lieu physique de l'événement. Dans le code, on évitera le mot `Room` pour ne pas confondre les deux.
- **Pas un rendez-vous en ligne.** Il n'y a ni visio ni lien de réunion.

### 0.3 Principe

1. L'admin place dans l'agenda une ou plusieurs **plages « Rendez-vous B2B »** : salle, horaire et nombre de tables.
2. La plateforme découpe ces plages en **créneaux** (ex. 20 minutes). La capacité d'un créneau est le nombre de tables disponibles à ce moment-là, toutes salles confondues.
3. Chaque participant coche les créneaux où il est disponible.
4. Un autre participant lui demande un rendez-vous sur l'un de ces créneaux. Une table est réservée pour eux à ce moment-là.
5. La demande ne devient un rendez-vous que si la personne sollicitée l'accepte. Les deux participants reçoivent alors le lieu exact : salle, table et heure.
6. Sans réponse, la demande expire au bout de 48 heures. Le créneau et la table se libèrent.

**Verdict de faisabilité : faisable sur la stack actuelle, sans nouvelle dépendance lourde.**

L'existant couvre déjà une bonne partie du besoin :

| Besoin                                                             | Brique existante                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Agenda de l'événement par sessions, avec salle et horaire          | `EventSession` (`room`, `startTime`, `endTime`), écran admin `/admin/evenements/[id]/agenda`, affichage par jour sur `/evenements/[id]` |
| Événements et inscriptions                                         | `Event`, `EventRegistration`                                                                                                            |
| Annuaire et profil membre                                          | `/catalogue`, `/membres/[id]`                                                                                                           |
| Cycle « demande → acceptée ou refusée » (schéma de code seulement) | Même mécanique que les demandes de contact Deal Room : transition conditionnelle sur le statut                                          |
| Emails                                                             | SMTP, gabarits React Email                                                                                                              |
| Liens sécurisés à usage unique                                     | `lib/tokens.ts`                                                                                                                         |
| Signature des liens et appels internes                             | `lib/hmac.ts`                                                                                                                           |
| Export CSV protégé contre l'injection de formules                  | `lib/csv.ts`                                                                                                                            |
| Tâche planifiée                                                    | Modèle du timer systemd des sauvegardes (`deploy/*.timer`)                                                                              |

Quatre choses n'existent pas et sont à construire :

1. **Un type de session « Rendez-vous B2B »** dans l'agenda, avec un nombre de tables.
2. **Les créneaux, les disponibilités et les réservations de table** (nouvelles tables).
3. **Une tâche planifiée applicative** pour les expirations (aucune n'existe dans l'app).
4. **Une gestion explicite du fuseau horaire** (§4.2). Aujourd'hui :
   - les horaires de l'agenda sont saisis sans fuseau (`datetime-local`), puis interprétés à l'heure du serveur ;
   - ils sont affichés sans fuseau explicite.

   C'est sans conséquence pour une date d'événement, mais **bloquant pour des créneaux de 20 minutes**.

**Estimation.**

- Version complète : **environ 22,5 jours**.
- Version réduite livrable en premier : **environ 13,5 jours** (§5.3), liste des participants comprise (§4.9).

---

## 1. Acteurs et notions

| Acteur ou notion              | Définition                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organisateur**              | Admin plateforme avec la section RBAC `evenements` (super-admin ou modérateur)                                                                                                            |
| **Participant**               | Membre actif d'une entreprise ayant une offre active, **inscrit à l'événement**, avec un profil complet et visible (RG-02). La définition exacte est à confirmer (§6, Q1).                |
| **Demandeur**                 | Participant qui envoie une demande de rendez-vous                                                                                                                                         |
| **Sollicité**                 | Participant qui reçoit la demande                                                                                                                                                         |
| **Salle de rendez-vous**      | Lieu physique réservé par CEO Summit sur le lieu de l'événement. C'est la salle d'une session « Rendez-vous B2B » de l'agenda.                                                            |
| **Plage « Rendez-vous B2B »** | Session de l'agenda de ce type. Elle a une salle, un horaire de début et de fin, et un **nombre de tables**, c'est-à-dire le nombre de rendez-vous simultanés possibles dans cette salle. |
| **Créneau**                   | Découpage d'une plage en durées fixes (ex. 10 h 00 – 10 h 20). Si plusieurs salles ont une plage au même moment, le créneau additionne leurs tables.                                      |
| **Table**                     | Place physique d'un rendez-vous : une salle et un numéro de table, attribués automatiquement.                                                                                             |

---

## 2. Parcours utilisateur

### 2.1 Avant l'événement — préparation

**Étape 1. L'organisateur prépare l'agenda.**

- Dans `/admin/evenements/[id]/agenda`, en plus des sessions habituelles (plénières, ateliers), il crée des sessions de type **« Rendez-vous B2B »**.
- Pour chacune, il indique :
  - la salle réservée (ex. « Salon Ravinala ») ;
  - l'horaire (ex. 14 h 00 – 17 h 00) ;
  - le **nombre de tables** (ex. 12).
- Il fixe aussi la **durée d'un créneau** (15, 20 ou 30 minutes), une fois pour tout l'événement. Une courte pause entre deux créneaux est possible, pour le changement de table.
- La plateforme **génère les créneaux** à partir de ces plages, avec un aperçu avant validation :
  - nombre de créneaux ;
  - capacité de chacun ;
  - nombre total de rendez-vous possibles.
- Modifier ou supprimer une plage qui porte déjà des rendez-vous acceptés est refusé, ou exige d'abord leur annulation avec notification aux participants (RG-12).
- Il ouvre les demandes à une date choisie : la « phase de networking » (Q4).

**Étape 2. Le participant complète son profil.**

- Champs requis pour être visible (proposition, à valider en Q2) : photo, nom, fonction, entreprise, secteur, courte présentation.
- Sur `/profil/editer`, un encart « Rendez-vous B2B » indique ce qui manque.

**Étape 3. Le participant active ses disponibilités.**

- Sur la fiche de l'événement, l'agenda affiche les plages « Rendez-vous B2B ». Un encart « Mes disponibilités » présente leurs créneaux sous forme de grille, avec un clic pour activer ou désactiver chacun.
- Une première activation vaut **adhésion au module** (opt-in, RG-02 et §4.6). Tant qu'il n'a coché aucun créneau, le participant n'apparaît pas dans l'annuaire des rendez-vous.
- Désactiver un créneau qui porte déjà une demande en attente ou un rendez-vous est refusé. Le participant doit d'abord refuser la demande ou annuler le rendez-vous.

### 2.2 Phase de networking — demande de rendez-vous

**Étape 4. Le demandeur consulte l'annuaire de l'événement.**

- Nouvel écran `/evenements/[id]/rendez-vous` : la liste des participants inscrits au module.
- Filtres : secteur, pays, « disponible sur tel créneau ».
- Le demandeur ne s'y voit pas (RG-01).

**Étape 5. Il ouvre le profil d'un participant.**

- Sur `/membres/[id]`, un bloc « Prendre rendez-vous à [événement] » liste les créneaux **réellement possibles**. Un créneau est possible si :
  - le sollicité s'y est déclaré disponible ;
  - aucun des deux n'a déjà une demande en attente ni un rendez-vous à ce moment-là (RG-03) ;
  - **il reste au moins une table libre** (RG-13).

**Étape 6. Il choisit un créneau, saisit un motif et envoie.**

- Motif obligatoire, 10 à 500 caractères.
- Dès l'envoi, dans une même transaction :
  - le créneau est réservé **pour les deux personnes** (RG-03) ;
  - **une table est réservée** (RG-13). Elle n'est révélée qu'à l'acceptation ;
  - la demande reçoit son échéance (RG-05).
- Le sollicité reçoit un email et voit un badge dans son espace.

### 2.3 Réponse à la demande

**Étape 7. Le sollicité accepte ou refuse.**

- Il peut répondre depuis deux endroits :
  - **Son espace** : page « Mes rendez-vous », onglet « Demandes reçues ».
  - **L'email** : les boutons « Accepter » et « Refuser » ouvrent une **page de confirmation** qui demande un clic final. Ce clic ne doit jamais se faire sur la simple ouverture du lien : les antivirus de messagerie ouvrent automatiquement les liens et accepteraient ou refuseraient à la place de la personne (§4.4).
- Un refus peut être accompagné d'un message facultatif.

**Étape 8a. Demande acceptée.**

- La demande devient un rendez-vous confirmé.
- Les deux participants reçoivent une confirmation avec :
  - la date et l'heure, en heure de Madagascar, indiquée explicitement ;
  - **la salle et le numéro de table** (ex. « Salon Ravinala — table 7 ») ;
  - le nom, la fonction et l'entreprise de l'autre participant ;
  - un fichier `.ics` et un lien « Ajouter à Google Agenda ».
- Le rendez-vous apparaît dans **l'agenda personnel du participant**, sur la fiche de l'événement, au milieu des sessions auxquelles il assiste.
- Facultatif (Q7) : une conversation de messagerie s'ouvre entre eux, pour se reconnaître ou décaler sur place.

**Étape 8b. Demande refusée ou expirée.**

- Le demandeur est notifié.
- Le créneau redevient libre pour les deux personnes et la table est libérée (RG-06).

### 2.4 Pendant et après l'événement

**Étape 9. Suivi.**

- La page « Mes rendez-vous » propose quatre onglets : à venir (avec salle et table), en attente (envoyées et reçues), passés, refusés ou expirés.
- Le jour J, la vue « à venir » sert de programme personnel : prochain rendez-vous, salle, table, interlocuteur avec sa photo.
- Un rendez-vous accepté peut être annulé par l'un ou l'autre, avec un motif, jusqu'à un délai à fixer avant le créneau (Q6). L'autre participant est notifié, le créneau et la table se libèrent.

**Étape 10. Signalement d'absence.**

- Après l'heure du créneau, chaque participant peut signaler « l'autre personne ne s'est pas présentée à la table », avec un commentaire facultatif.
- Le rendez-vous passe en « absence signalée » et apparaît dans l'administration (RG-08).
- La personne signalée est notifiée et peut contester : c'est la « réclamation ».

**Étape 11. Côté organisateur.**

- **Tableau de bord** :
  - créneaux et tables disponibles ;
  - taux d'occupation par salle ;
  - participants inscrits au module ;
  - demandes envoyées et taux d'acceptation ;
  - rendez-vous confirmés ;
  - absences signalées.
- **Plan de salle imprimable par créneau.** Pour chaque salle et chaque créneau, la liste « table → les deux participants ». L'équipe sur place s'en sert pour orienter les gens. C'est le principal livrable opérationnel le jour J.
- **Export CSV** : un rendez-vous par ligne, avec les deux participants, leurs entreprises, le créneau, la salle, la table, le statut et le motif.
- **File des réclamations** :
  - statut ouvert ou traité, avec une note interne ;
  - actions possibles : confirmer l'absence, annuler le signalement, ou annuler le rendez-vous.

---

## 3. Règles de gestion

| RG                                        | Règle                                                                                                               | Mise en œuvre proposée                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RG-01                                     | Pas de rendez-vous avec soi-même                                                                                    | Contrôle serveur, plus une contrainte `CHECK (requester_id <> recipient_id)` en base                                                                                                                                                                             |
| RG-02                                     | Seuls les profils complets **et** visibles participent                                                              | Profil complet selon la liste de champs de Q2. « Visible » = inscrit à l'événement **et** adhérent au module. Vérifié pour le demandeur et pour le sollicité, à l'envoi et à l'acceptation.                                                                      |
| RG-03                                     | Un créneau réservé ou en attente ne peut pas être repris                                                            | Une **réservation par personne et par créneau** (table `MeetingPersonHold`, unique sur `[userId, slotId]`). Créée pour les deux personnes dans la même transaction que la demande. Une seconde demande concurrente échoue sur l'unicité, sans verrou applicatif. |
| RG-04                                     | Une demande doit être acceptée pour devenir un rendez-vous                                                          | Statuts `PENDING → ACCEPTED` uniquement par le sollicité, via une transition conditionnelle (`updateMany … where status = PENDING`)                                                                                                                              |
| RG-05                                     | Expiration automatique sans réponse                                                                                 | Échéance = **48 h après l'envoi**, ramenée avant le début du créneau s'il arrive avant, moins une marge (Q5). Calculée et stockée à l'envoi (`expiresAt`).                                                                                                       |
| RG-06                                     | Refus, expiration ou annulation libèrent le créneau et la table                                                     | Suppression des réservations de personnes et de table dans la même transaction que le changement de statut                                                                                                                                                       |
| RG-07                                     | Seul le sollicité accepte ou refuse ; seul le demandeur retire sa demande                                           | Contrôle serveur, plus un jeton d'email lié au sollicité et à cette demande seulement                                                                                                                                                                            |
| RG-08                                     | Absences signalables et suivies par l'administration                                                                | Signalement possible seulement après le début du créneau et par un des deux participants, une fois par personne. File admin avec statut.                                                                                                                         |
| RG-09 _(proposée)_                        | Nombre maximal de demandes en attente par demandeur                                                                 | Sans plafond, un participant peut bloquer des dizaines de créneaux et de tables sans attendre de réponse. Proposition : **10 demandes en attente** au maximum (Q3).                                                                                              |
| RG-10 _(proposée)_                        | Une seule demande en cours entre deux mêmes personnes pour un même événement                                        | Évite qu'une personne en sollicite une autre plusieurs fois de suite                                                                                                                                                                                             |
| RG-11 _(proposée)_                        | Demandes ouvertes seulement pendant la phase de networking, et jamais sur un créneau passé                          | Dates d'ouverture et de fermeture stockées sur la configuration du module                                                                                                                                                                                        |
| RG-12 _(proposée)_                        | Une plage ou un créneau portant des rendez-vous acceptés ne peut être modifié ou supprimé sans annulation explicite | Les participants concernés sont notifiés                                                                                                                                                                                                                         |
| RG-13 _(nouvelle, issue de la précision)_ | Jamais plus de rendez-vous simultanés que de tables                                                                 | Une **réservation de table** unique sur `[slotId, sessionId, tableNumber]`, créée à l'envoi de la demande. Plus aucune table libre = plus de demande possible sur ce créneau. La surréservation est impossible, même en cas d'envois simultanés.                 |
| RG-14 _(nouvelle)_                        | Les créneaux n'existent que dans les plages « Rendez-vous B2B » de l'agenda                                         | Générés à partir de ces sessions uniquement. Aucun créneau en dehors des salles réservées.                                                                                                                                                                       |

---

## 4. Faisabilité technique

### 4.1 Modèle de données

**Changement sur l'existant (agenda) : non destructif.**

```text
EventSession            + kind (SESSION | B2B_MEETINGS)   défaut SESSION
                        + meetingTableCount Int?          requis si kind = B2B_MEETINGS
```

**Nouvelles tables.**

```text
EventMeetingConfig      eventId (unique), slotMinutes, breakMinutes, opensAt, closesAt, isEnabled
EventMeetingSlot        id, eventId, startsAt, endsAt                    @@unique([eventId, startsAt])
MeetingAvailability     userId, slotId                                   @@unique([userId, slotId])
MeetingRequest          id, eventId, slotId, requesterId, recipientId,
                        status (PENDING|ACCEPTED|DECLINED|EXPIRED|CANCELLED|WITHDRAWN),
                        reason, responseMessage, expiresAt, respondedAt,
                        cancelledById, cancelReason, createdAt
MeetingPersonHold       userId, slotId, requestId                        @@unique([userId, slotId])
MeetingTableBooking     slotId, sessionId, tableNumber, requestId (unique)
                                                                         @@unique([slotId, sessionId, tableNumber])
MeetingNoShowReport     id, requestId, reporterId, reportedUserId, comment,
                        status (OPEN|CONFIRMED|DISMISSED), adminNote, createdAt
                                                                         @@unique([requestId, reporterId])
```

**Pourquoi des créneaux au niveau de l'événement, et pas de la salle.** Un participant se déclare disponible « à 10 h 20 », pas « à 10 h 20 dans le Salon Ravinala ». La salle et la table sont attribuées par la plateforme. Si deux salles ont une plage au même moment, le créneau additionne leurs tables, et la réservation choisit la première table libre, toutes salles confondues.

**Réservations portées par la base.** Prisma ne sait pas déclarer d'index unique partiel (`WHERE status IN (…)`). Deux tables de réservation garantissent donc les règles RG-03 et RG-13 directement en base, sans SQL manuel ni verrou applicatif :

- `MeetingPersonHold` : un créneau par personne ;
- `MeetingTableBooking` : une table par rendez-vous.

On les crée et on les supprime avec la demande.

**Génération des créneaux.**

- Une fonction pure, testable, prend en entrée les sessions B2B (début, fin, tables), la durée d'un créneau et la pause.
- Elle renvoie la liste des créneaux et leur capacité.
- Les **jours viennent de l'agenda** : le champ `Event.date` unique n'est plus un obstacle, il n'y a pas besoin de date de fin.

**Aucune migration destructive** : un champ ajouté à `EventSession` avec une valeur par défaut, le reste en tables nouvelles.

### 4.2 Fuseau horaire — prérequis bloquant

**Constat.**

- Les horaires de l'agenda sont saisis en `datetime-local`, sans fuseau (`lib/validations/event-session.ts`). Le serveur les interprète avec son propre fuseau horaire.
- Le conteneur ne fixe pas de `TZ`.
- Aucun affichage ne précise de fuseau (`lib/utils.ts::formatDateFr`).

Un créneau « 10 h 00 » peut donc être stocké ou affiché avec 3 heures d'écart (UTC contre UTC+3).

**À faire, pour l'agenda existant comme pour les créneaux.**

- Interpréter toute saisie comme `Indian/Antananarivo` (UTC+3, sans heure d'été).
- Stocker en UTC.
- Afficher toujours avec la mention « heure de Madagascar ».
- Utiliser un helper unique, testé.
- Dans le `.ics`, écrire les heures en UTC.

**Avant de livrer**, vérifier les sessions d'agenda déjà en base : elles ont pu être enregistrées décalées.

### 4.3 Expiration automatique à 48 h

Deux mécanismes complémentaires :

1. **Expiration à la lecture.** Toute requête traite une demande `PENDING` dont l'échéance est passée comme expirée. Une demande ne peut pas être acceptée après son échéance. **La règle ne dépend donc pas de la tâche planifiée.**
2. **Tâche planifiée toutes les 10 minutes.** Elle passe les demandes en `EXPIRED`, supprime leurs réservations de personnes et de table (RG-06) et envoie les notifications.
   - Recommandation : un timer systemd sur le VPS, sur le modèle de `deploy/ceo-summit-backup.timer`, qui appelle une route interne `POST /api/internal/meetings/expire` protégée par un secret (HMAC, `lib/hmac.ts`).
   - L'appel est idempotent, et il n'y a pas de nouveau service Docker.
   - Écartée : une boucle dans le serveur temps réel. Elle mélange les domaines et se multiplierait si l'on ajoute des instances.

### 4.4 Liens d'action dans l'email

- **Jeton** : aléatoire, à usage unique, propre à une demande et à son destinataire. Il expire avec la demande. Il est stocké haché, comme les jetons de réinitialisation.
- **Page de confirmation** : le lien ouvre `/rendez-vous/repondre/[token]`, qui affiche la demande et deux boutons. **L'ouverture seule ne modifie rien.**
- **Connexion** : une décision est nécessaire (Q9). Recommandation : la réponse est possible sans connexion grâce au jeton, mais limitée à cette demande et à ces deux actions.

### 4.5 Calendrier et documents du jour J

- **Fichier `.ics`** :
  - généré côté serveur, sans librairie ;
  - contenu : `UID`, `DTSTART` et `DTEND` en UTC, `SUMMARY` (« Rendez-vous B2B — [nom] »), `LOCATION` (« [lieu de l'événement], [salle], table [n] »), `DESCRIPTION` ;
  - joint à l'email de confirmation et téléchargeable.

  Un `.ics` avec `METHOD:CANCEL` et le même `UID` retire le rendez-vous des calendriers en cas d'annulation.

- **Lien « Ajouter à Google Agenda »** : une simple URL.
- **Plan de salle par créneau**, côté admin : une page imprimable (CSS d'impression) qui liste les tables et les paires de participants par salle et par créneau. Pas de PDF nécessaire en version 1. `@react-pdf/renderer` est déjà installé si un PDF est demandé plus tard.

### 4.6 Données personnelles (Loi 25 / RGPD)

Le module expose à d'autres participants trois éléments : la présence à l'événement, les disponibilités et le motif des demandes.

- **Opt-in explicite par événement**, à la première activation de disponibilité (RG-02). Révocable : retirer toutes ses disponibilités le sort de l'annuaire, sans toucher aux rendez-vous déjà confirmés.
- **Motif et message de refus** : visibles uniquement par les deux personnes concernées et par l'administration.
- **Données de l'équipe** : le plan de salle et l'export sont réservés à la section RBAC `evenements`. À mentionner dans la politique de confidentialité, dont la réécriture est déjà requise (module 17, §1.2).

### 4.7 Charge et concurrence

- **Ordre de grandeur** : 200 participants × environ 20 créneaux × 10 à 20 tables, soit quelques milliers de lignes. C'est négligeable pour PostgreSQL.
- **Seul point sensible** : deux demandes simultanées sur le même créneau, ou sur la dernière table libre. Les contraintes d'unicité de `MeetingPersonHold` et `MeetingTableBooking` le règlent. Le perdant reçoit « Ce créneau vient d'être réservé, choisissez-en un autre ».

### 4.8 Intégration dans l'existant

- **Module 17, phase P0** : à pousser avant de commencer. Elle corrige justement les inscriptions aux événements (ré-inscription, « Inscrit ✓ »), sur lesquelles RG-02 s'appuie.
- **Module 17, phases P2 et P3** : le module 17 prévoit de retirer le check-in/QR des événements et de restructurer le code par module. Recommandation : construire ce module **directement dans la structure cible** (`modules/event-meetings/{actions, queries, rules, components, emails, *.test.ts}`), comme premier module « propre ».
- **Agenda** : l'écran admin `/admin/evenements/[id]/agenda` et l'affichage de l'agenda sur `/evenements/[id]` sont étendus, pas dupliqués. Les plages B2B y apparaissent avec un style distinct, et les rendez-vous confirmés du participant s'y insèrent.
- **Evolia** : il gère les badges et le contrôle d'accès à l'entrée. Il n'y a pas d'interaction en version 1. Plus tard, ses données d'entrée pourraient confirmer automatiquement une absence.
- **Hors périmètre** : Deal Room et salles thématiques en ligne ne sont pas touchés (§0.2).

### 4.9 Accès à l'événement : offre rattachée, participants désignés par le gérant (décision du 2 octobre)

**Principe retenu — le plus simple.**

1. **L'admin** rattache chaque offre à son événement (« CEO Summit [année] ») au moment où il configure l'offre.
2. **L'entreprise** paie son offre. Le paiement donne l'accès à la plateforme, **pas** l'inscription à l'événement.
3. **Le gérant** désigne, parmi les comptes de son entreprise, qui participe à l'événement, dans la limite des places de l'offre. Il peut s'inclure lui-même avec « Je participe ».
4. **Quand il valide la liste**, chaque participant est inscrit à l'événement de l'offre (`EventRegistration` confirmée).
5. **Un participant inscrit** voit l'événement, son agenda et le module rendez-vous, depuis son tableau de bord et depuis la fiche de l'événement. Il y configure ses disponibilités (§2.1, étape 3).

**Pas de validation par l'admin** (confirmé le 2 octobre). Désigner un participant est le choix du gérant, et ces places sont déjà payées dans l'offre. La validation de la liste inscrit donc immédiatement.

**Au-delà du quota de places.** Le gérant ne peut pas cocher plus de participants que `seatCap`. La plateforme lui propose alors d'acheter des places supplémentaires (parcours de supplément existant, `purchaseUpsellSeats`). Le règlement passe par l'un de deux chemins :

- **Checkout Evolia** : carte ou Mobile Money. Ce chemin reste bloqué tant qu'Evolia n'a pas répondu (`BACKLOG_MVP.md`, `conception/08`).
- **Virement bancaire** : avec une preuve de paiement, **validé par l'admin**. C'est le seul endroit du parcours où l'admin intervient.

Dès que le supplément est confirmé, les places s'ajoutent (`extraSeats`) et le gérant peut cocher les participants en plus.

Option non retenue pour la version 1 : laisser le gérant cocher au-delà du quota, avec des participants « en attente de places » inscrits automatiquement à la confirmation du supplément. C'est plus fluide, mais il faut un état de plus à gérer.

**Cela tranche Q1** : un participant est un collaborateur désigné par le gérant et inscrit à l'événement de l'offre. Un collaborateur non désigné garde l'accès à la plateforme (Deal Room, annuaire, messagerie), mais pas aux rendez-vous de l'événement.

**Écran à construire.** Dans l'onglet « Gestion compte » de `/entreprises/[id]`, réservé au gérant :

- **Liste** : les comptes de l'entreprise, une case « Participant » par personne, et la case « Je participe » existante pour le gérant.
- **Compteur** : « 3 / 5 places utilisées » (`seatCap`), avec un rappel du supplément de places existant si la liste est pleine.
- **Validation** : un bouton « Valider la liste des participants ». Il inscrit les nouveaux participants et notifie chacun par email (« Vous participez au CEO Summit — configurez vos disponibilités »).
- **Modification après validation** :
  - **retirer** un participant annule son inscription et ses demandes et rendez-vous, après confirmation, avec notification aux personnes concernées ;
  - **ajouter** un participant l'inscrit.

  Il faut une date limite de modification (Q12).

- **Si le collaborateur n'a pas encore de compte**, le gérant l'invite d'abord, avec le parcours d'invitation existant, puis le coche.

Cette même validation est le point de départ prévu pour Evolia (`company.participants.confirmed`, `conception/11` §3 et `conception/12` §3.3) : les badges physiques suivront la même liste.

**Ce que ça change dans le code existant.**

1. **L'inscription automatique de tous les comptes au paiement est désactivée.** Elle passe désormais par la liste du gérant. Elle concerne `lib/payment-confirmations.ts` et `app/actions/company-invites.ts` (RG-14). Sans ce changement, tout le monde serait inscrit d'office. Les règles de plafond (`seatCap`, « Je participe », capacité de l'événement) sont reprises telles quelles dans la validation de la liste.
2. **Le catalogue d'inscription est revu.** `getActivePlans()` ne renvoie aujourd'hui que les offres **sans** événement : rattacher les offres viderait `/inscription` et `/entreprise/paiement`. Les offres rattachées doivent rester au catalogue.
3. **Le choix de l'événement est réexposé** dans le formulaire admin des offres (retiré le 22 septembre, `conception/12` §2.6).
4. **Expiration après l'événement.** L'abonnement passe en « Expirée » après la date de l'événement (RG-12, `lib/company-subscription-status.ts`). Décision à confirmer en Q11.

**Entreprises déjà payées.** Il n'y a pas de script d'inscription à prévoir : l'admin rattache leurs offres à l'événement, puis chaque gérant compose sa liste comme les nouveaux clients. Il faut seulement leur envoyer une communication (broadcast) pour les inviter à le faire.

**Travail ajouté (≈ 2,5 j, inclus dans la version réduite).** Il comprend :

- l'écran liste des participants et sa validation ;
- la désactivation de l'inscription automatique ;
- la règle du catalogue ;
- le sélecteur dans l'admin ;
- l'email au participant ;
- l'encart sur le tableau de bord ;
- les tests (plafond de places, retrait d'un participant, catalogue d'inscription inchangé).

**Éditions suivantes.** Chaque année, l'admin crée l'événement de l'édition et y rattache les offres de cette édition. Les offres déjà vendues restent rattachées à l'édition passée.

---

## 5. Découpage et estimation

### 5.1 Écrans

| Écran                                             | Rôle                                                                                            | Nouveau ou existant          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------- |
| `/dashboard`                                      | Encart « CEO Summit [année] — mon agenda et mes rendez-vous »                                   | Existant, étendu             |
| `/admin/plans`                                    | Choix de l'événement auquel l'offre donne accès                                                 | Existant, réexposé           |
| `/entreprises/[id]` → onglet « Gestion compte »   | Liste des participants à l'événement, cases « Participant », compteur de places, validation     | Existant, étendu             |
| `/admin/evenements/[id]/agenda`                   | Type de session « Rendez-vous B2B », salle, nombre de tables                                    | Existant, étendu             |
| `/admin/evenements/[id]` → onglet « Rendez-vous » | Durée des créneaux, génération avec aperçu, ouverture des demandes, tableau de bord, export     | Nouvel onglet                |
| `/admin/evenements/[id]/rendez-vous/plan`         | Plan de salle imprimable par créneau                                                            | Nouveau                      |
| `/admin/evenements/[id]/rendez-vous/reclamations` | File des absences signalées                                                                     | Nouveau                      |
| `/evenements/[id]`                                | Agenda avec les plages B2B et mes rendez-vous ; encart « Mes disponibilités »                   | Existant, étendu             |
| `/evenements/[id]/rendez-vous`                    | Annuaire des participants inscrits au module                                                    | Nouveau                      |
| `/membres/[id]` → bloc « Prendre rendez-vous »    | Créneaux possibles, formulaire de demande                                                       | Nouveau bloc                 |
| `/rendez-vous`                                    | Mes rendez-vous : à venir avec salle et table, en attente, passés, refusés ou expirés ; actions | Nouveau, ajouté au menu      |
| `/rendez-vous/repondre/[token]`                   | Réponse depuis l'email                                                                          | Nouveau, public via le jeton |

### 5.2 Emails (7 gabarits)

1. Demande reçue.
2. Demande acceptée, avec salle, table et `.ics`.
3. Demande refusée.
4. Demande expirée, envoyée aux deux personnes.
5. Rendez-vous annulé, avec un `.ics` d'annulation.
6. Rappel la veille avec le programme personnel du lendemain _(optionnel)_.
7. Absence signalée, pour la personne concernée.

### 5.3 Estimation

| Lot | Contenu                                                                                                                               | Jours        | Version réduite            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| 1   | Modèle de données, migration, helper de fuseau horaire et correction de la saisie de l'agenda, tests                                  | 2            | ✅                         |
| 2   | Agenda admin : type « Rendez-vous B2B » et tables ; configuration et génération des créneaux avec aperçu                              | 2            | ✅                         |
| 3   | Disponibilités du participant dans l'agenda, opt-in                                                                                   | 1,5          | ✅                         |
| 4   | Annuaire de l'événement, bloc profil, envoi de demande avec réservation de personnes et de table (RG-01 à RG-03, RG-09, RG-10, RG-13) | 3            | ✅                         |
| 5   | Accepter, refuser ou retirer, depuis l'espace membre ; attribution de la table                                                        | 1            | ✅                         |
| 6   | Liens d'action dans l'email, page de confirmation                                                                                     | 1            | —                          |
| 7   | Expiration : à la lecture et tâche planifiée                                                                                          | 1            | ✅                         |
| 8   | Emails, `.ics` et lien Google Agenda                                                                                                  | 1,5          | ✅ (sans rappel)           |
| 9   | « Mes rendez-vous » et rendez-vous dans l'agenda personnel ; annulation                                                               | 2            | ✅ (sans annulation : 1,5) |
| 10  | Plan de salle imprimable par créneau                                                                                                  | 0,5          | ✅                         |
| 11  | Absences et réclamations, côté membre et côté admin                                                                                   | 1,5          | —                          |
| 12  | Tableau de bord admin et export CSV                                                                                                   | 1            | — (export seul : 0,5)      |
| 13  | Tests d'intégration (dernière table, double demande, expiration), recette                                                             | 2            | ✅ (1)                     |
| 14  | Offres rattachées à l'événement, liste des participants validée par le gérant, encart tableau de bord (§4.9)                          | 2,5          | ✅                         |
|     | **Total**                                                                                                                             | **≈ 22,5 j** | **≈ 13,5 j**               |

**La version réduite couvre tout ce qu'il faut pour que les rencontres aient lieu le jour J** :

- l'agenda avec les plages B2B ;
- les disponibilités ;
- les demandes avec réservation de table ;
- la réponse dans l'espace membre ;
- l'expiration ;
- la confirmation par email avec salle, table et `.ics` ;
- le programme personnel ;
- le plan de salle pour l'équipe ;
- un export simple.

Elle laisse pour un second lot : la réponse depuis l'email, l'annulation, les absences et réclamations, le tableau de bord complet et le rappel la veille.

**Risques identifiés.**

- Fuseau horaire (§4.2). Il touche aussi l'agenda déjà en production.
- Profil « complet » mal défini : trop de participants exclus ou, à l'inverse, des profils vides visibles.
- Demandes abusives qui bloquent des tables (RG-09).
- **Capacité réelle des salles** : si le nombre de tables saisi est faux, la plateforme confirmera des rendez-vous sans place. Il faut faire valider les chiffres par l'équipe logistique.
- Recette à faire avec des données réalistes avant l'événement : au moins 30 comptes de test, 2 salles et un jeu de créneaux.

---

## 6. Questions ouvertes

| #   | Question                                                                                                                                                                                                        | Proposition par défaut                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Q1  | ~~Qui est « participant » ?~~ **Tranché le 2 octobre** (§4.9) : collaborateur désigné par le gérant dans la liste des participants, dans la limite des places de l'offre, puis inscrit à l'événement de l'offre | —                                                                                                        |
| Q12 | Jusqu'à quand le gérant peut-il modifier la liste des participants (retirer annule aussi les rendez-vous de la personne) ?                                                                                      | Jusqu'à la fermeture des demandes de rendez-vous (Q4)                                                    |
| Q11 | Après la date de l'événement, l'abonnement doit-il passer en « Expirée » (règle RG-12 actuelle des offres rattachées à un événement), pour permettre le rachat de l'édition suivante ?                          | Oui, accès plateforme conservé                                                                           |
| Q2  | Quels champs rendent un profil « complet » ?                                                                                                                                                                    | Photo, fonction, entreprise, secteur, présentation                                                       |
| Q3  | Plafond de demandes en attente par personne ?                                                                                                                                                                   | 10                                                                                                       |
| Q4  | Dates d'ouverture et de fermeture des demandes ?                                                                                                                                                                | Ouverture fixée par l'admin ; fermeture la veille au soir, pour figer les plans de salle                 |
| Q5  | Expiration quand le créneau arrive avant les 48 h ?                                                                                                                                                             | Au plus tard 2 h avant le créneau                                                                        |
| Q6  | Un rendez-vous accepté peut-il être annulé ? Jusqu'à quand ?                                                                                                                                                    | Oui, avec un motif, jusqu'à 2 h avant                                                                    |
| Q7  | Ouvrir une conversation de messagerie à l'acceptation, pour se reconnaître ou se prévenir d'un retard ?                                                                                                         | Oui                                                                                                      |
| Q8  | Les tables sont-elles numérotées physiquement, et le numéro doit-il figurer dans la confirmation ? Ou les participants s'installent-ils librement dans la salle ?                                               | Tables numérotées, numéro communiqué à l'acceptation                                                     |
| Q9  | Répondre depuis l'email sans se connecter ?                                                                                                                                                                     | Oui, par jeton à usage unique limité à cette demande                                                     |
| Q10 | Les plages « Rendez-vous B2B » peuvent-elles chevaucher des conférences de l'agenda ? Si oui, faut-il empêcher un participant de prendre un rendez-vous pendant une session où il est inscrit ?                 | Chevauchement autorisé, sans contrôle en version 1 : c'est le participant qui choisit ses disponibilités |
