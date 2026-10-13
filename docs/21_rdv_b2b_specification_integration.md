# Module 21 — Rendez-vous B2B : spécification consolidée pour intégration

> **Statut :** V1 en cours de codage en local (branche `feat/rdv-evenement` du dépôt `app/`, non poussée). **Lots 1 à 4 faits ; restent les lots 5 à 10** — suivi détaillé au **§9 État d'avancement**. D2, D3, D13, D14, D18 et D19 tranchées ; D1, D4, D9, D12, D16 et D17 retenues pour le codage ; D5 à D8, D10, D11 et D15 (V2) restent à valider.
> **Version :** 1.1 — précisions du client du 8 octobre (créneaux networking dans l'événement, distincts du Programme ; disponibilités à activer ; onglet « Rendez-vous événement » du profil public)
> **Date :** 8 octobre 2026
> **Sources :**
>
> - `conception/doc-rdv-evenement.md` : spécification produit du client, reprise du plugin WordPress `b2b-ceo-summit` (référence fonctionnelle) ;
> - `conception/18_rendez_vous_b2b_evenement.md` : étude de faisabilité du 2 octobre, confrontée au code de la plateforme.
>
> **Objet :** confronter les deux documents, fixer la cible **intégrée à la plateforme existante**, et séparer ce qu'on intègre d'abord (V1, ce qu'il faut pour le jour J) de ce qui viendra ensuite (V2).
> **Règle de lecture :** en cas de désaccord, la spécification du client (`doc-rdv-evenement`) l'emporte sur le module 18, sauf mention contraire justifiée au §2.

---

## 0. Résumé

**Ce que fait le module.** Pendant l'événement CEO Summit, les participants se rencontrent en face à face dans une **zone RDV B2B** dédiée, sur des **créneaux networking** déployés par l'admin dans l'événement (distincts du Programme) et activés par chaque participant selon ses disponibilités. Un participant demande un rendez-vous, l'autre accepte ou refuse ; sans réponse sous 48 h, la demande expire. Le téléphone n'est partagé qu'après confirmation.

**Comment on l'intègre.** Dans la plateforme actuelle (Next.js, Prisma, PostgreSQL), **pas comme une application React séparée**. Les endpoints REST de la spécification deviennent des actions serveur, avec quelques routes pour le calendrier et les exports. Les écrans s'appuient sur ce qui existe : profil public, onglets « Mon profil », bibliothèque d'emails, exports CSV et PDF.

**Ce qui change par rapport au module 18.**

| Sujet          | Module 18                                                                              | Cible (spécification client)                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables         | Réservation d'une table numérotée par rendez-vous, capacité par créneau, plan de salle | **Aucune table.** Suivi par événement, zone, créneau et participants uniquement.                                                                    |
| Événement      | Plages « Rendez-vous B2B » ajoutées dans l'agenda de l'événement                       | **Option « Créneaux networking » de l'événement CEO Summit**, distincte du Programme (agenda multi-salles), avec sa zone et ses indications d'accès |
| Créneaux       | Découpés à partir des plages de l'agenda                                               | **Grille générée** par l'admin (dates, heures, durée, pause, dates exclues), publiée puis distribuée aux participants                               |
| Disponibilités | Le participant coche ses créneaux (opt-in)                                             | Le participant **active** les créneaux où il est disponible (opt-in, tranché le 8 octobre, §7 D3)                                                   |
| Téléphone      | Non traité                                                                             | **Visible seulement après confirmation**, jamais renvoyé avant par le serveur                                                                       |
| Profil public  | Seuls les créneaux possibles                                                           | **Onglet « Rendez-vous événement »** : créneaux activés par le membre ; pris ou en attente visibles mais non cliquables                             |
| Espaces membre | « Mes rendez-vous » + disponibilités sur la fiche événement                            | **« Mes créneaux » et « Mes rendez-vous » séparés**                                                                                                 |

**Estimation.** V1 (jour J) : **environ 14 jours**. V2 (suivi et confort) : **environ 6 jours**. Détail au §6.

---

## 0 bis. Précisions du client (8 octobre 2026)

Parcours tel que décrit par le client, qui fait foi :

1. **Deux choses distinctes dans l'événement.** Le **Programme** (agenda multi-salles, `EventSession`, déjà livré) reste tel quel. Les **créneaux de networking** sont une **option séparée de l'événement**, utilisée uniquement pendant l'événement : c'est là que l'admin déploie les créneaux de prise de rendez-vous.
2. **Le participant active ses disponibilités.** Chaque participant désigné voit les créneaux déployés et **active ceux où il est disponible** (et laisse les autres inactifs). Révisé le même jour : les créneaux sont **actifs par défaut** et le participant désactive ceux où il n'est pas disponible (D3).
3. **Prise de rendez-vous depuis le profil.** Un membre visite le profil d'un autre participant, ouvre l'**onglet « Rendez-vous événement »** et y voit les créneaux que ce membre a activés pendant l'événement. Il en réserve un.
4. **Le créneau se bloque.** Dès la réservation, le créneau est **désactivé (non cliquable) pour les visiteurs suivants**.
5. **Réponse.** Si la personne **accepte**, le rendez-vous est confirmé et les deux s'échangent leurs coordonnées (téléphone, RG-04). Si elle **refuse** (ou si la demande expire), le créneau **redevient actif** et réservable.
6. **Période de réservation.** Les demandes sont possibles **dès la publication des créneaux** (donc avant l'événement) et **jusqu'à la fin de l'événement**. Le module se désactive automatiquement à la fin de l'événement. Pas de date d'ouverture ni de fermeture à saisir par l'admin → **D14 tranchée**.

7. **Parcours admin complet** (offre → événement → créneaux) : détaillé au **§3.0**.

Conséquences sur ce document : C2, C6, §3.0, §3.1, §3.4 (P1, P2, P4), RG-06, RG-11, RG-12, RG-14, D2, D3, D13 et D14 mis à jour ci-dessous.

> **Où en est-on ?** Voir le **§9 État d'avancement** en fin de document.

---

## 1. Principe d'intégration

1. **Une seule application.** Le module vit dans la plateforme, avec la même connexion, les mêmes comptes et les mêmes profils. Aucune dépendance à WordPress : ni shortcode, ni PHP, ni `wp-admin`.
2. **Actions serveur plutôt qu'API REST.** Chaque endpoint de la spécification correspond à une action serveur (tableau au §8). Seuls trois points restent de vraies routes HTTP : le fichier `.ics`, les exports, et l'appel de la tâche planifiée d'expiration.
3. **Code rangé par module.** Construit directement dans la structure cible du module 17 (`modules/event-meetings/…`), comme premier module « propre ».
4. **Réutilisation de l'existant** (§5) : profil public, onglets « Mon profil », bibliothèque d'emails éditable, exports CSV lisibles par Excel et PDF, jetons sécurisés, journal d'audit.

---

## 2. Confrontation des deux documents et décisions proposées

| #   | Point                                   | `doc-rdv-evenement`                                                                               | Module 18                                                                              | Proposition                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Support                                 | Application React autonome + API dédiée                                                           | Plateforme existante                                                                   | **Plateforme existante** : mêmes comptes, profils et sécurité ; pas de seconde application à héberger (§7 D1).                                                                                                                                                                                                                              |
| C2  | Objet événement                         | Événement RDV dédié, distinct des événements                                                      | Plages dans l'agenda de l'événement                                                    | **Tranché (8 oct.)** : les créneaux networking sont une **option de l'événement CEO Summit**, gérée dans une section à part (`/admin/evenements/[id]/creneaux`), **sans lien avec le Programme** (`EventSession`). Pas d'objet « événement RDV » séparé : les réglages (zone, indications, durée des créneaux) sont portés par l'événement. |
| C3  | Lieu                                    | Une zone/salle RDV obligatoire + indications                                                      | Plusieurs salles avec tables                                                           | **Une zone RDV par événement** (nom, lieu, indications), sans capacité.                                                                                                                                                                                                                                                                     |
| C4  | Tables                                  | Aucune                                                                                            | Tables numérotées                                                                      | **Aucune table** (règle client). Le module 18 §4.1 (`MeetingTableBooking`), RG-13, Q8 et le plan de salle par table sont abandonnés.                                                                                                                                                                                                        |
| C5  | Créneaux                                | Grille admin, distribuée aux participants éligibles                                               | Découpage de l'agenda                                                                  | **Grille admin** (§3.3).                                                                                                                                                                                                                                                                                                                    |
| C6  | Disponibilités par défaut               | Créneaux distribués, à désactiver                                                                 | Opt-in explicite (RGPD)                                                                | **Tranché (8 oct.) : opt-in.** Les créneaux sont visibles par chaque participant, **inactifs par défaut** ; il active ceux où il est disponible.                                                                                                                                                                                            |
| C7  | Participant éligible                    | Compte actif, nom, entreprise, téléphone, e-mail, profil visible ou validé, participation validée | Collaborateur désigné par le gérant, inscrit à l'événement (§4.9)                      | **Les deux combinés** : désigné par le gérant (module 18 §4.9) **et** profil minimum (nom, entreprise, téléphone, e-mail). Le téléphone est déjà obligatoire à l'édition du profil (QA du 7 octobre, §2).                                                                                                                                   |
| C8  | Validation du profil par l'organisation | « Profil visible ou validé par l'organisation »                                                   | Pas de validation admin                                                                | Pas de validation admin en V1 : le profil minimum suffit (§7 D4).                                                                                                                                                                                                                                                                           |
| C9  | Téléphone                               | Visible après confirmation seulement                                                              | —                                                                                      | **Retenu tel quel** (RG-04).                                                                                                                                                                                                                                                                                                                |
| C10 | Réponse depuis l'email                  | Liens accepter/refuser à usage unique                                                             | Page de confirmation avant l'action (les antivirus ouvrent les liens)                  | **Page de confirmation** : la sécurité du module 18 est conservée (§7 D10). Les liens restent à usage unique et stockés hachés.                                                                                                                                                                                                             |
| C11 | Statut « terminé »                      | `completed`                                                                                       | Calculé                                                                                | **Calculé** à l'affichage (heure de fin passée), pas de tâche (§7 D5).                                                                                                                                                                                                                                                                      |
| C12 | Annulation d'un RDV confirmé            | Statut `cancelled` sans parcours décrit                                                           | Annulation avec motif jusqu'à 2 h avant                                                | V2, avec motif et notification (§7 D11).                                                                                                                                                                                                                                                                                                    |
| C13 | Absences                                | Signalement + réclamations `open / transmitted / resolved`                                        | Signalement + contestation                                                             | **Réclamations de la spécification client**, en V2 (§7 D6).                                                                                                                                                                                                                                                                                 |
| C14 | Relance admin                           | Sur demande en attente, sans prolonger les 48 h                                                   | —                                                                                      | **Retenu**, en V2.                                                                                                                                                                                                                                                                                                                          |
| C15 | Exports                                 | CSV, XLSX, PDF                                                                                    | CSV                                                                                    | **CSV (lisible par Excel FR) et PDF** avec l'existant ; XLSX non nécessaire (Excel ouvre le CSV).                                                                                                                                                                                                                                           |
| C16 | Présentation des emails                 | Entête bleu dégradé `#004aad`, expéditeur « B2B CEO Summit »                                      | Gabarits de la plateforme                                                              | **Gabarit de la plateforme** (bleu marine et or) pour la cohérence, contenus et pieds de page de la spécification client, expéditeur `noreply@ceo-summit.mg` déjà configuré (§7 D9).                                                                                                                                                        |
| C17 | Garde-fous anti-abus                    | Anti double clic, idempotence                                                                     | Plafond de demandes en attente (RG-09), une seule demande entre deux personnes (RG-10) | **Les deux** (RG-09 et RG-10 conservées).                                                                                                                                                                                                                                                                                                   |
| C18 | Fuseau horaire                          | Non traité                                                                                        | Prérequis bloquant (§4.2), heure de Madagascar                                         | **Fuseau horaire réglé par l'admin pour chaque événement** (8 oct. : rencontre à La Réunion, UTC+4, alors que Madagascar est en UTC+3). Saisie et affichage dans le fuseau de l'événement, stockage en UTC (§7 D19).                                                                                                                        |
| C19 | Données legacy du plugin                | Question ouverte                                                                                  | —                                                                                      | À trancher (§7 D8).                                                                                                                                                                                                                                                                                                                         |

---

## 3. Spécification cible

### 3.0 Parcours admin : offre, événement, créneaux (8 octobre 2026)

Ordre des opérations décrit par le client :

**Étape 1 — Créer l'offre** (`/admin/plans`, existant). L'admin crée l'offre (ex. Executive pass, Corporate Premium) avec ses tarifs.

**Étape 2 — Créer l'événement** (`/admin/evenements/nouveau`). Le formulaire comporte, dans cet ordre :

| Section                        | Contenu                                                                                                                                                                                                                                                       | Par rapport à l'existant                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Informations générales         | **Nom** (ex. « CEO Summit 2027 — La Réunion »), **type d'événement**, **description**                                                                                                                                                                         | Inchangé                                                                                                                                                                           |
| Date & lieu                    | **Fuseau horaire de l'événement** (liste : Madagascar, La Réunion, Maurice, Mayotte et Comores, Seychelles, Paris… ; Madagascar par défaut), début, fin, lieu (ou réunion Zoom)                                                                               | **Ajout du fuseau horaire** (D19)                                                                                                                                                  |
| Programme                      | Lien vers l'agenda multi-salles (`/admin/evenements/[id]/agenda`)                                                                                                                                                                                             | Inchangé ; les intervenants restent saisis par session dans l'agenda                                                                                                               |
| **Pièces jointes**             | Fichiers téléchargeables par les participants sur la fiche de l'événement : **PDF** (programme, plan d'accès, brochure), images (JPG, PNG, WebP), documents bureautiques (Word, Excel, PowerPoint). Titre affiché par fichier, ordre modifiable, suppression. | **Remplace la section « Intervenants »** (texte libre « Nom \| Poste \| Entreprise »). Stockage sur le stockage objet existant (R2), taille maximale par fichier à fixer (§7 D17). |
| **Créneaux rendez-vous**       | Liste des créneaux networking rattachés à l'événement, groupés par jour, avec leur statut et le nombre de demandes ou rendez-vous. **L'admin peut désactiver un créneau** (ou le réactiver), et accéder à la création de créneaux.                            | **Nouvelle section** (P1)                                                                                                                                                          |
| Bannière de l'événement        | Image d'en-tête                                                                                                                                                                                                                                               | Inchangé                                                                                                                                                                           |
| Capacité & accès, Tarification | Capacité ; le prix unique est ignoré dès qu'une offre est liée                                                                                                                                                                                                | Inchangé                                                                                                                                                                           |

**Étape 3 — Lier l'offre à l'événement.** L'offre est rattachée à l'événement (lien `Plan.eventId`, déjà en place). **Les inscrits de toutes les offres liées à l'événement sont inscrits directement à l'événement**, sans démarche séparée, quel que soit le type d'offre : ce sont eux les participants qui peuvent activer des créneaux et prendre rendez-vous (confirmé par le client le 8 octobre).

| Type d'offre liée                                                                                   | Qui est inscrit à l'événement                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offre individuelle                                                                                  | Le membre, dès que son adhésion est active                                                                                                                    |
| Offre entreprise                                                                                    | Les collaborateurs désignés par le gérant dans la limite des places de l'offre (module 18 §4.9, déjà codé : `company-participants.ts`)                        |
| **Offre partenaire** (ex. « Partenaire Institutionnel », créée et attribuée par l'admin, module 20) | Comme une offre entreprise : les collaborateurs désignés par le gérant du partenaire, dans la limite des places accordées par l'admin. Aucun paiement requis. |

Condition (confirmée par le client le 8 octobre) : l'offre partenaire doit elle aussi être **liée à l'événement** par l'admin (même réglage que les autres offres). Une offre non liée à l'événement n'inscrit personne.

**Inscription automatique (codée le 8 octobre).** Dès qu'une offre est liée à un événement, les membres des entreprises abonnées sont inscrits **automatiquement, dans la limite des places de l'offre : le gérant d'abord, puis les collaborateurs par date d'arrivée**. Le gérant peut ensuite changer la liste depuis son espace ; un membre qu'il a retiré n'est jamais réinscrit automatiquement. L'inscription se déclenche quand l'admin lie l'offre à l'événement, à la validation du paiement, à l'achat de places en supplément, quand un collaborateur rejoint l'entreprise et quand un partenaire accepte son invitation. Si l'admin change l'événement d'une offre, les inscriptions faites par cette offre sur l'ancien événement sont annulées. La capacité de l'événement reste un plafond. Les offres déjà liées avant ce changement se rattrapent avec `scripts/backfill-event-registrations.ts` (aperçu par défaut, `--apply` pour inscrire).

**Réservé aux « Summit annuel » (8 octobre).** Les créneaux rendez-vous ne se créent que pour un événement de type **Summit annuel**, sur place. Le type reste par ailleurs une simple catégorie d'affichage (filtres, badge). Les créneaux ne sont distribués qu'aux membres **inscrits par une offre active liée à ce Summit**, prérequis validés : compte actif, inscription confirmée (non retirée par le gérant), profil minimum (RG-02).

**Étape 4 — Créer les créneaux et les assigner à un événement.** Depuis la page **« Créneaux rendez-vous »** de l'admin (`/admin/rendez-vous/creneaux`) ou depuis la section du même nom de l'événement :

1. L'admin **choisit un événement déjà créé** (liste déroulante ; présélectionné s'il vient de la fiche de l'événement).
2. Il renseigne la zone RDV et les indications d'accès, puis génère la grille (jours de l'événement, heures, durée, pause) ou ajoute un créneau à la main.
3. Il publie : les créneaux apparaissent, inactifs, dans « Mes créneaux » de chaque inscrit (P4).

**Désactivation d'un créneau par l'admin.** Différente de celle du participant : un créneau désactivé par l'admin disparaît pour **tous** les participants (plus activable, plus réservable). S'il porte des demandes en attente ou des rendez-vous confirmés, l'admin doit confirmer leur annulation, et les personnes concernées sont notifiées (RG-12). Il peut le réactiver ensuite ; les participants doivent alors réactiver leur disponibilité.

### 3.1 Objets

| Objet                                              | Rôle                                                                                | Champs principaux                                                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Réglages networking** (`EventMeetingSetup`)      | Option « Créneaux networking » d'un événement CEO Summit (un au plus par événement) | événement, **zone RDV** (obligatoire), **indications d'accès**, statut (brouillon, publié ; fermé est calculé à la fin de l'événement), durée d'un créneau, pause              |
| **Créneau** (`MeetingTimeSlot`)                    | Un horaire de networking pendant l'événement                                        | événement (choisi parmi les événements existants), début, fin, statut (brouillon, publié, **désactivé par l'admin**)                                                           |
| **Pièce jointe d'événement** (`EventAttachment`)   | Document téléchargeable de la fiche événement (remplace « Intervenants »)           | événement, titre, fichier (clé R2), type MIME, taille, ordre                                                                                                                   |
| **Créneau participant** (`MeetingParticipantSlot`) | Disponibilité d'un participant sur un créneau                                       | membre, créneau, statut (inactif **par défaut**, libre, en attente, réservé), demande liée. **Unique par membre et par créneau.** Créé quand le participant active le créneau. |
| **Demande / rendez-vous** (`MeetingBooking`)       | Rencontre entre deux participants                                                   | demandeur, destinataire, créneau, motif, statut, échéance, date de réponse, jeton de décision (haché)                                                                          |
| **Réclamation** (`MeetingClaim`, V2)               | Absence signalée                                                                    | rendez-vous, auteur, personne signalée, commentaire, statut (ouverte, transmise, résolue), note admin                                                                          |

Aucun objet « table ». Aucune réutilisation de `Room` (salles de discussion en ligne) ni de `EventSession` (Programme / agenda multi-salles) : les créneaux networking sont une option à part de l'événement. Les participants sont ceux désignés par leur gérant (module 18 §4.9), sans table de liaison supplémentaire.

### 3.2 Statuts

**Demande / rendez-vous**

| Statut                | Signification                                    | Téléphone visible      |
| --------------------- | ------------------------------------------------ | ---------------------- |
| En attente            | Demande envoyée, sans réponse                    | Non                    |
| Confirmé              | Accepté par le destinataire                      | **Oui**, pour les deux |
| Refusé                | Refusé par le destinataire                       | Non                    |
| Expiré                | Sans réponse au bout de 48 h                     | Non                    |
| Annulé (V2)           | Annulé par l'un des deux ou par l'admin          | Non                    |
| Terminé               | Confirmé et heure de fin passée (calculé)        | Oui                    |
| Absence signalée (V2) | Réclamation ouverte après un rendez-vous terminé | Oui                    |

**Créneau participant** : inactif (par défaut, ou désactivé par le participant), libre (activé, réservable), en attente (bloqué par une demande, non cliquable pour les autres), réservé (rendez-vous confirmé). Refus, expiration ou retrait ramènent le créneau à **libre**.

### 3.3 Règles de gestion

| RG    | Règle                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RG-01 | Pas de rendez-vous avec soi-même (contrôle serveur et contrainte en base).                                                                                                                                                                                                                                                                                                                                                                   |
| RG-02 | Seul un **participant éligible** peut activer, demander ou recevoir : événement de type « Summit annuel », compte actif, offre de son entreprise active et liée à cet événement, inscription confirmée faite par cette offre (non retirée par le gérant), profil minimum (nom, entreprise, téléphone, e-mail). Vérifié côté serveur à chaque action.                                                                                         |
| RG-03 | Un créneau en attente ou réservé ne peut pas être repris. La demande bloque **les deux** créneaux (destinataire et demandeur) en une transaction, par un passage conditionnel « libre → en attente » : deux demandes simultanées ne peuvent pas réussir toutes les deux.                                                                                                                                                                     |
| RG-04 | Le téléphone de l'autre participant n'est renvoyé par le serveur que pour un rendez-vous confirmé ou terminé.                                                                                                                                                                                                                                                                                                                                |
| RG-05 | Seul le destinataire accepte ou refuse ; seul le demandeur retire sa demande.                                                                                                                                                                                                                                                                                                                                                                |
| RG-06 | Échéance (§7 D13) : **demande envoyée le jour même du créneau** → expire **à l'heure du créneau** sans réponse. **Demande envoyée un jour précédent** → 48 h après l'envoi, ramenée à **10 minutes avant le début du créneau** si c'est plus tôt. Dans les deux cas le créneau est libéré. « Jour même » s'apprécie dans le fuseau horaire de l'événement (D19). La règle s'applique à la lecture, même si la tâche planifiée est en retard. |
| RG-07 | Refus, expiration, retrait ou annulation libèrent les deux créneaux dans la même transaction.                                                                                                                                                                                                                                                                                                                                                |
| RG-08 | Motif obligatoire, 10 à 500 caractères.                                                                                                                                                                                                                                                                                                                                                                                                      |
| RG-09 | Au plus **10 demandes en attente** par demandeur (§7 D12).                                                                                                                                                                                                                                                                                                                                                                                   |
| RG-10 | Une seule demande en cours entre deux mêmes personnes pour un même événement.                                                                                                                                                                                                                                                                                                                                                                |
| RG-11 | Demandes possibles **de la publication des créneaux jusqu'à la fin de l'événement**, et jamais sur un créneau déjà commencé (D13). Après la fin de l'événement, le module passe en lecture seule (plus de demande, d'activation ni de réponse ; « Mes rendez-vous » reste consultable).                                                                                                                                                      |
| RG-12 | Après publication, modifier, **désactiver** ou supprimer un créneau portant une demande ou un rendez-vous exige d'abord leur annulation (confirmée par l'admin), avec notification aux personnes concernées.                                                                                                                                                                                                                                 |
| RG-13 | Désactiver un créneau ou masquer ses disponibilités n'annule aucun rendez-vous confirmé ni aucune demande en cours.                                                                                                                                                                                                                                                                                                                          |
| RG-14 | Un participant devenu éligible après la publication voit les créneaux publiés (inactifs) et reçoit l'email l'invitant à activer ses disponibilités. Un participant retiré de la liste par son gérant voit ses demandes et rendez-vous annulés, avec notification.                                                                                                                                                                            |
| RG-15 | Jeton d'email : long, haché en base, propre à une demande et à son destinataire, à usage unique, invalide dès que la demande n'est plus en attente.                                                                                                                                                                                                                                                                                          |

### 3.4 Parcours

**P1 — L'admin déploie les créneaux networking de l'événement** (voir aussi §3.0, étape 4)

1. Page **« Créneaux rendez-vous »** de l'admin (choix d'un événement existant) ou section du même nom dans la fiche de l'événement (`/admin/evenements/[id]/creneaux`), à côté de « Programme » (agenda multi-salles) et « Inscrits », sans lien avec le Programme. Réglages : **zone RDV et indications** (obligatoires). Pas de dates d'ouverture ou de fermeture : la réservation s'ouvre à la publication et se ferme à la fin de l'événement (RG-11).
2. **Grille** : jours de l'événement concernés, heure de début et de fin par jour, durée d'un créneau (ex. 30 min), pause optionnelle (ex. 12 h 30 – 14 h 00). Les créneaux restent dans les dates de l'événement.
3. **Aperçu** : créneaux par date, nombre total de créneaux, nombre de participants inscrits. Suppression, **désactivation** ou ajout manuel d'un créneau ; régénération de la grille tant que rien n'est publié. Après publication, désactivation et réactivation restent possibles (RG-12).
4. **Publication** : les créneaux deviennent visibles par les participants (inactifs), qui reçoivent l'email « configurez vos créneaux ».

**P2 — Un participant demande un rendez-vous**

1. **Point d'entrée principal : le profil du membre.** Profil public `/membres/[id]`, nouvel **onglet « Rendez-vous événement »** (à côté de Profil, Entreprise, Opportunités, Services), visible seulement si le visiteur et le membre participent tous deux à l'événement. Il liste les créneaux que le membre a **activés** : libres cliquables ; en attente ou réservés visibles mais grisés (« déjà pris ») ; message clair s'il n'y a plus de créneau libre ou si le membre n'a activé aucun créneau.
2. **Annuaire RDV** de l'événement (secondaire) : participants ayant au moins un créneau libre, recherche par nom, entreprise ou secteur, lien vers l'onglet « Rendez-vous événement » de chaque profil.
3. **Demande** : choix du créneau, motif obligatoire, envoi (bouton désactivé au clic, contrôle serveur de toutes les règles).
4. **Email au destinataire** (contenu de la spécification client) avec liens « Accepter » et « Décliner » vers une page de confirmation.

**P3 — Le destinataire répond**

- Depuis « Mes rendez-vous » ou depuis l'email (V2 pour l'email, §6).
- **Accepter** : rendez-vous confirmé, les deux créneaux passent en réservé, emails de confirmation aux deux (zone, indications, coordonnées dont le téléphone, `.ics`).
- **Refuser** : créneaux libérés, email au demandeur.

**P4 — « Mes créneaux »** (onglet de « Mon profil », prévu au rapport QA du 7 octobre)

- Tous les créneaux publiés de l'événement, groupés par date, **inactifs tant que le participant ne les active pas**, avec leur statut et des compteurs (total, actifs, en attente, réservés).
- Activer ou désactiver un créneau ; boutons « Tout activer » et « Tout désactiver ». Désactiver ne touche ni les demandes en cours ni les rendez-vous confirmés (RG-13).

**P5 — « Mes rendez-vous »** (onglet de « Mon profil »)

- Une carte par demande ou rendez-vous : date, heure, partenaire (nom, entreprise), statut, rôle (demandeur ou destinataire), motif, zone et indications.
- Filtres : tous, en attente, confirmés, passés, refusés, expirés.
- Actions selon le statut : accepter ou refuser (demande reçue), retirer (demande envoyée), `.ics` et téléphone (confirmé), signaler une absence (passé, V2).

**P6 — Calendrier** : `.ics` (heures en UTC, lieu, zone, indications, participants, motif) depuis l'email de confirmation et « Mes rendez-vous », plus un lien « Ajouter à Google Agenda ». Uniquement pour un rendez-vous confirmé ou terminé.

**P7 — Suivi par l'admin**

- **V1** : liste de tous les rendez-vous avec filtres (statut, date), export CSV et PDF, liste terrain par créneau imprimable (qui rencontre qui, à quelle heure).
- **V2** : relance d'une demande en attente (sans prolonger les 48 h), file des réclamations, tableau de bord.

**P8 — Automatisations**

- **Expiration** : à la lecture (RG-06) et par une tâche toutes les **5 minutes**, pour que l'email d'expiration parte au plus près de l'échéance (timer systemd sur le modèle des sauvegardes, appelant une route interne signée).
- **Terminé** : calculé à l'affichage.
- **Nettoyage des incohérences** (V2) : créneaux bloqués sans demande active, libérés et journalisés.

### 3.5 Emails

Tous dans la **bibliothèque d'emails** (Admin → Emails), donc modifiables sans développement. **Les modèles déjà rédigés dans la spécification client sont repris tels quels** (confirmé le 8 octobre) : objets, corps, variables et pieds de page de `doc-rdv-evenement.md` §7 (Email 2.A « Demande envoyée », emails de confirmation aux participants, email admin) et §14 (en-tête, pieds participant et admin, liste des emails requis). Seule la mise en forme suit le gabarit de la plateforme (D9).

| Email                                                        | Destinataire                                       | Lot |
| ------------------------------------------------------------ | -------------------------------------------------- | --- |
| Nouvelle demande de rendez-vous                              | Destinataire                                       | V1  |
| Rendez-vous confirmé, avec `.ics`                            | Demandeur                                          | V1  |
| Rendez-vous confirmé, avec `.ics`                            | Destinataire                                       | V1  |
| Demande refusée                                              | Demandeur                                          | V1  |
| Demande expirée                                              | Demandeur et destinataire                          | V1  |
| Vous participez aux rendez-vous B2B, configurez vos créneaux | Participant, à la publication ou à son inscription | V1  |
| Notification de confirmation                                 | Admin                                              | V2  |
| Rappel d'une demande en attente                              | Destinataire                                       | V2  |
| Absence signalée                                             | Admin                                              | V2  |

### 3.6 Sécurité et données personnelles

- Toutes les règles sont vérifiées côté serveur : connexion, éligibilité, propriétaire du créneau, participant du rendez-vous, destinataire pour répondre, statut courant, conflits horaires, validité du jeton, droit de voir le téléphone.
- Actions sensibles journalisées (journal d'audit existant).
- Le motif n'est visible que des deux participants et de l'organisation.
- Exports réservés à la section admin « événements ».
- Mention à ajouter dans la politique de confidentialité, à réécrire de toute façon (module 17, §1.2).

---

## 4. Prérequis

1. **Liste des participants validée par le gérant** (module 18 §4.9) : c'est elle qui rend un membre éligible. À construire en premier si elle ne l'est pas encore.
2. **Fuseau horaire par événement** (module 18 §4.2, élargi par D19) : champ « fuseau horaire » sur l'événement, réglé par l'admin ; toutes les heures de cet événement (dates, Programme, créneaux, emails, échéances) sont saisies et affichées dans ce fuseau avec la mention explicite (« 14 h 00, heure de La Réunion »), stockées en UTC ; helper unique testé. L'échange Evolia, qui envoie aujourd'hui un fuseau fixe (`Indian/Antananarivo`, `lib/evolia.ts`), devra envoyer celui de l'événement.
3. **Pousser et déployer** les branches en attente (P2, QA du 7 octobre, partenaires) pour partir d'une base à jour.

---

## 5. Ce qui existe déjà

| Besoin                                          | Brique existante                                   |
| ----------------------------------------------- | -------------------------------------------------- |
| Profil public avec onglets, « Mon profil »      | `/membres/[id]`, `/profil` (QA du 7 octobre)       |
| Téléphone obligatoire                           | Édition du profil (QA du 7 octobre, §2)            |
| Annuaire avec recherche et filtres secteur/pays | `/catalogue`, sélecteurs secteur/pays              |
| Emails éditables                                | Bibliothèque d'emails (`resolveEmail`)             |
| Jetons à usage unique                           | `lib/tokens.ts`                                    |
| Exports CSV pour Excel et PDF                   | `lib/csv.ts` (`toExcelCsv`), `@react-pdf/renderer` |
| Badge et offre                                  | `lib/offer-badge.ts`                               |
| Journal d'audit, RBAC admin                     | `AuditLog`, `requireAdmin`                         |
| Tâche planifiée                                 | Modèle `deploy/ceo-summit-backup.timer`            |

---

## 6. Découpage V1 / V2

### V1 — ce qu'il faut pour le jour J (≈ 14 jours)

| Lot   | Contenu                                                                                                                                                      | Jours                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 1     | Modèle de données et migration, fuseau horaire par événement (champ admin, helper, correction de la saisie du Programme, Evolia), tests                      | 2                                |
| 2     | Admin : page « Créneaux rendez-vous » (choix de l'événement) et section de la fiche événement, zone, grille, aperçu, publication, désactivation d'un créneau | 2,5                              |
| 2 bis | Formulaire événement : section « Pièces jointes » (envoi R2, types autorisés, ordre) à la place de « Intervenants »                                          | 1                                |
| 3     | « Mes créneaux » (onglet de « Mon profil »)                                                                                                                  | 1                                |
| 4     | Onglet « Rendez-vous événement » du profil public, annuaire RDV, envoi de demande (RG-01 à RG-03, RG-08 à RG-11)                                             | 2,5                              |
| 5     | Accepter, refuser, retirer depuis « Mes rendez-vous »                                                                                                        | 1                                |
| 6     | Expiration à la lecture et tâche planifiée                                                                                                                   | 1                                |
| 7     | Emails V1 (§3.5), `.ics` et lien Google Agenda                                                                                                               | 1                                |
| 8     | « Mes rendez-vous » (onglet de « Mon profil ») avec filtres et téléphone après confirmation                                                                  | 1                                |
| 9     | Admin : liste des rendez-vous, export CSV et PDF, liste terrain par créneau                                                                                  | 1                                |
| 10    | Tests d'intégration (demandes simultanées, expiration) et recette avec ~30 comptes                                                                           | 1 (inclus dans le total arrondi) |

### V2 — à intégrer ensuite (≈ 6 jours)

| Lot | Contenu                                                                     | Jours      |
| --- | --------------------------------------------------------------------------- | ---------- |
| 11  | Réponse depuis l'email : jetons et page de confirmation                     | 1          |
| 12  | Annulation d'un rendez-vous confirmé, avec motif et notification            | 1          |
| 13  | Signalement d'absence et réclamations (ouverte, transmise, résolue)         | 1,5        |
| 14  | Relance admin et email admin à chaque confirmation                          | 0,5        |
| 15  | Tableau de bord admin (demandes, taux d'acceptation, rendez-vous, absences) | 1          |
| 16  | Nettoyage automatique des incohérences                                      | 0,5        |
| 17  | Reprise des données du plugin WordPress, si décidée (§7 D8)                 | à chiffrer |

---

## 7. Décisions à valider

| #   | Question                                                                                                | Proposition                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Intégrer dans la plateforme plutôt que dans une application React séparée ?                             | **Retenu pour le codage (8 oct.)** — **Oui** : une seule application, mêmes comptes et profils.                                                                                                                                                                                                                                                                                              |
| D2  | L'événement RDV est-il rattaché à l'événement CEO Summit de l'édition pour savoir qui participe ?       | **Tranché (8 oct.)** : les créneaux sont une option de l'événement CEO Summit lui-même, distincte du Programme ; participants = inscrits de toutes les offres liées à l'événement, partenaires compris (§3.0, étape 3).                                                                                                                                                                      |
| D3  | Créneaux distribués actifs par défaut (spécification client) ou à activer par le participant (opt-in) ? | **Tranché puis révisé (8 oct.) : actifs par défaut** pour les participants inscrits par une offre ; chacun désactive ensuite ceux où il n'est pas disponible.                                                                                                                                                                                                                                |
| D4  | Faut-il une validation des profils par l'organisation ?                                                 | **Retenu pour le codage (8 oct.)** — **Non en V1** : le profil minimum suffit.                                                                                                                                                                                                                                                                                                               |
| D5  | « Terminé » stocké ou calculé ?                                                                         | **Calculé**.                                                                                                                                                                                                                                                                                                                                                                                 |
| D6  | Absences et réclamations dès la V1 ?                                                                    | **Non**, en V2.                                                                                                                                                                                                                                                                                                                                                                              |
| D7  | Une relance admin prolonge-t-elle les 48 h ?                                                            | **Non** (spécification client).                                                                                                                                                                                                                                                                                                                                                              |
| D8  | Reprendre les données du plugin WordPress ?                                                             | À décider. Sans besoin d'historique, **non**.                                                                                                                                                                                                                                                                                                                                                |
| D9  | Présentation des emails : gabarit de la plateforme ou entête bleu du plugin ?                           | **Retenu pour le codage (8 oct.)** — **Gabarit de la plateforme**, contenus du client.                                                                                                                                                                                                                                                                                                       |
| D10 | Réponse depuis l'email : action directe ou page de confirmation ?                                       | **Page de confirmation** (protection contre l'ouverture automatique des liens).                                                                                                                                                                                                                                                                                                              |
| D11 | Un rendez-vous confirmé peut-il être annulé ? Jusqu'à quand ?                                           | Oui, avec motif, jusqu'à 2 h avant (V2).                                                                                                                                                                                                                                                                                                                                                     |
| D12 | Plafond de demandes en attente par personne ?                                                           | **Retenu pour le codage (8 oct.)** — **10**.                                                                                                                                                                                                                                                                                                                                                 |
| D13 | Échéance quand le créneau arrive avant les 48 h ?                                                       | **Tranché (8 oct.)** : **demande du jour même** → expire à l'heure du créneau ; **demande d'un jour précédent** → la plus proche entre « envoi + 48 h » et « début du créneau − 10 min ». Le créneau est alors libéré. Exemples : jeudi 11 h pour jeudi 14 h → expire jeudi 14 h ; mercredi 18 h pour jeudi 14 h → expire jeudi 13 h 50 ; lundi 10 h pour jeudi 14 h → expire mercredi 10 h. |
| D14 | Dates d'ouverture et de fermeture des demandes ?                                                        | **Tranché (8 oct.)** : ouverture à la publication des créneaux, fermeture à la fin de l'événement.                                                                                                                                                                                                                                                                                           |
| D15 | Ouvrir une conversation de messagerie à la confirmation ?                                               | Oui (V2, faible effort).                                                                                                                                                                                                                                                                                                                                                                     |
| D16 | Filtre « Passés » affiché par défaut dans « Mes rendez-vous » ?                                         | **Retenu pour le codage (8 oct.)** — Non : « À venir » par défaut, « Passés » en filtre.                                                                                                                                                                                                                                                                                                     |
| D17 | Pièces jointes : types et taille maximale ?                                                             | **Retenu pour le codage (8 oct.)** — PDF, JPG, PNG, WebP, Word, Excel, PowerPoint ; **20 Mo** par fichier, 10 fichiers par événement.                                                                                                                                                                                                                                                        |
| D18 | Que deviennent les intervenants déjà saisis en texte libre sur les événements existants ?               | **Tranché (8 oct.)** : la section « Intervenants » du formulaire et le bloc « Intervenants confirmés » de la page publique sont retirés ; les données existantes restent en base sans être affichées (aucune perte, réversible). Les intervenants par session du Programme restent affichés ; à ressaisir dans les sessions si besoin.                                                       |
| D19 | Fuseau horaire : fixe (Madagascar) ou réglé par événement ?                                             | **Tranché (8 oct.) : réglé par l'admin pour chaque événement** (rencontre à La Réunion). Les heures sont toujours affichées dans le fuseau de l'événement, quel que soit le pays du visiteur, avec la mention du fuseau : c'est l'heure à laquelle il faut être sur place.                                                                                                                   |

---

## 8. Correspondance des endpoints

| Spécification client                              | Plateforme                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/events/:eventId/participants`           | Page annuaire RDV (lecture serveur)                                         |
| `GET /api/events/:eventId/participants/:id/slots` | Onglet « Rendez-vous événement » du profil public                           |
| `GET /api/me/slots`, `PATCH /api/me/slots[/:id]`  | Onglet « Mes créneaux » + actions `toggleMeetingSlot`, `setAllMeetingSlots` |
| `POST /api/admin/events/:eventId/slots/generate`  | Action `generateMeetingSlots` (aperçu) puis `publishMeetingSlots`           |
| `POST /api/bookings`                              | Action `requestMeeting`                                                     |
| `GET /api/me/bookings`                            | Onglet « Mes rendez-vous »                                                  |
| `POST /api/bookings/:id/accept`, `/decline`       | Actions `acceptMeeting`, `declineMeeting`                                   |
| `GET /api/booking-decisions`                      | Page `/rendez-vous/repondre/[jeton]` (V2)                                   |
| `GET /api/bookings/:id/ics`                       | Route `/api/rendez-vous/[id]/ics`                                           |
| `POST /api/bookings/:id/no-show`                  | Action `reportNoShow` (V2)                                                  |
| `GET /api/admin/bookings`, `/export`              | Page `/admin/rendez-vous/[id]` + route d'export CSV/PDF                     |
| `POST /api/admin/bookings/:id/remind`             | Action `remindMeetingRequest` (V2)                                          |
| `GET/PATCH /api/admin/claims`                     | Page et actions des réclamations (V2)                                       |

Les codes d'erreur de la spécification client (§16) sont repris comme messages d'erreur des actions, en français.

---

## 9. État d'avancement

> **Mis à jour le :** 8 octobre 2026
> **Code :** dépôt `app/`, branche `feat/rdv-evenement`, 16 commits locaux d'avance sur `mvp-connect-simple`, **non poussée** (pousser `mvp-connect-simple` déploie en production).
> **Tests :** 97 fichiers de tests verts, aussi en `TZ=UTC` (fuseau du serveur de production).

### 9.1 Fait

| Lot   | Contenu                                                                                                                                                                                                                                                                   | Commits                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1     | Tables `EventMeetingSetup`, `MeetingTimeSlot`, `MeetingParticipantSlot`, `MeetingBooking` ; **fuseau horaire réglé par événement** (D19) : formulaire, Programme, page publique, Evolia ; migration recalant de 3 h les horaires existants                                | `23495aa`                                                                   |
| 2     | Admin : menu Opérations → « Créneaux rendez-vous » (choix d'un Summit) et page `/admin/evenements/[id]/creneaux` : zone RDV et indications, grille (jours, plage, durée, pause) avec aperçu, ajout manuel, publication, désactivation / réactivation (RG-12), suppression | `e2fc2d6`, `fd03dc5`                                                        |
| 2 bis | « Pièces jointes » à la place d'« Intervenants » (D17, D18) : PDF, images, Word, Excel, PowerPoint ; 20 Mo, 10 fichiers ; type vérifié sur le contenu ; bloc « Documents » sur la page publique                                                                           | `eb98ffd`                                                                   |
| 3     | « Mes créneaux » (onglet de « Mon profil », toujours visible) : **actifs par défaut** (D3 révisée), interrupteur, « Tout activer / Tout désactiver », statuts en couleur, une ligne par créneau en grille                                                                 | `1088b0b`, `c936d96`, `7851c0f`, `90d47b5`, `c14c203`, `4aa8d52`, `7f8d2a4` |
| —     | **Inscription automatique** des membres d'une offre liée à un événement (§3.0 étape 3), dans la limite des places, gérant d'abord ; ré-enregistrer l'offre rattrape les oubliés ; script `scripts/backfill-event-registrations.ts`                                        | `7db6f3b`, `b3efd42`                                                        |
| —     | Créneaux réservés aux **« Summit annuel »** et aux membres inscrits par une offre active (RG-02)                                                                                                                                                                          | `c2939d4`                                                                   |
| 4     | Onglet **« Rendez-vous événement »** sur le profil d'un autre participant : créneaux libres / déjà pris / indisponibles ; **demande avec motif** ; blocage atomique des deux créneaux (RG-03) ; RG-01, RG-02, RG-06 (échéance D13), RG-08 à RG-11                         | `58352be`                                                                   |

### 9.2 Reste à faire — V1 (jour J)

| Lot   | Contenu                                                                                                                                                                                                                                                                                                                                                                                     | Estimation | État       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| 5 + 8 | **« Mes rendez-vous »** (onglet de « Mon profil ») : demandes reçues et envoyées, **Accepter / Refuser / Retirer** (RG-05, RG-07 : refus et retrait libèrent les deux créneaux), passage « en attente » → « réservé » à l'acceptation, **téléphone visible après confirmation** (RG-04), filtres (à venir par défaut, en attente, confirmés, passés, refusés, expirés), zone et indications | ~2 j       | ⏳ à faire |
| 6     | **Expiration** des demandes sans réponse (RG-06, D13) : à la lecture, et tâche planifiée toutes les 5 min (timer systemd appelant une route interne signée) qui libère les créneaux                                                                                                                                                                                                         | ~1 j       | ⏳ à faire |
| 7     | **Emails** (bibliothèque d'emails, contenus du doc client §7 et §14) : nouvelle demande, confirmation aux deux avec `.ics` et lien Google Agenda, refus, expiration, « vos créneaux sont ouverts » (publication / nouvelle inscription), annulation par l'organisation (désactivation d'un créneau) ; route `/api/rendez-vous/[id]/ics`                                                     | ~1 j       | ⏳ à faire |
| 9     | **Admin — suivi** : liste de tous les rendez-vous avec filtres (statut, date), export CSV (Excel FR) et PDF, liste terrain par créneau imprimable                                                                                                                                                                                                                                           | ~1 j       | ⏳ à faire |
| 10    | Tests de bout en bout (demandes simultanées, expiration) et recette avec ~30 comptes                                                                                                                                                                                                                                                                                                        | ~1 j       | ⏳ à faire |
| (4)   | Annuaire RDV de l'événement (participants ayant des créneaux libres, recherche) — entrée secondaire, le profil restant l'entrée principale                                                                                                                                                                                                                                                  | ~0,5 j     | ⏳ à faire |

**Total restant V1 : ~6,5 jours.**

### 9.3 V2 (après le jour J)

| Lot | Contenu                                                             | Décision liée |
| --- | ------------------------------------------------------------------- | ------------- |
| 11  | Répondre depuis l'email (jeton haché, page de confirmation)         | D10           |
| 12  | Annulation d'un rendez-vous confirmé, avec motif et notification    | D11           |
| 13  | Signalement d'absence et réclamations (ouverte, transmise, résolue) | D6            |
| 14  | Relance admin d'une demande, email admin à chaque confirmation      | D7            |
| 15  | Tableau de bord admin                                               | —             |
| 16  | Nettoyage automatique des incohérences                              | —             |
| 17  | Reprise des données du plugin WordPress (si décidée)                | D8            |
| —   | Conversation de messagerie ouverte à la confirmation                | D15           |

### 9.4 À faire au moment de la mise en production

| #   | Action                                                                                                                                                       | Pourquoi                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Fusionner `feat/rdv-evenement` dans `mvp-connect-simple` et pousser — **uniquement avec l'accord explicite du client**                                       | Le push déploie                                                                                                                                  |
| 2   | Après le déploiement, vérifier les horaires de quelques événements et sessions du Programme                                                                  | La migration `20261008150000_event_timezone_and_meetings` retire 3 h aux horaires existants (stockés jusqu'ici en heure de Madagascar comme UTC) |
| 3   | Lancer `npx tsx scripts/backfill-event-registrations.ts` (aperçu), puis `--apply` (avec emails), ou ré-enregistrer chaque offre liée dans l'admin            | Inscrire les membres des offres liées avant l'inscription automatique                                                                            |
| 4   | Passer `client_max_body_size` à **25M** dans le nginx de l'hôte (`/etc/nginx/conf.d/ceo-summit.conf`)                                                        | Pièces jointes de 20 Mo                                                                                                                          |
| 5   | Prévenir Evolia que `eventDetails.timezone` et le décalage des dates suivent désormais le fuseau de l'événement (`Indian/Reunion`, `+04:00` pour La Réunion) | Changement de valeur dans les envois                                                                                                             |
| 6   | Régler le fuseau « La Réunion » sur l'événement CEO Summit 2027 dans l'admin                                                                                 | Les événements existants sont en heure de Madagascar par défaut                                                                                  |
