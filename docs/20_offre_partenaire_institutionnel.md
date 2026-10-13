# Module 20 — Offres partenaires (sans paiement, intégrées par l'admin) : étude d'intégration

> **Statut :** codé en local le 7 octobre, commit `41f7734` sur la branche `feat/partenaires`, non poussé. 891 tests verts ; parcours vérifié de bout en bout dans Chrome. Reste : la phrase à ajouter dans la documentation Evolia (§4.4) quand l'échange sera branché.
> **Version :** 1.2
> **Date :** 7 octobre 2026
> **Origine :** rapport QA du 7 octobre (`conception/19`, §6.2) : « partenaires institutionnels intégrés manuellement, à discuter plus tard ».
> **Méthode :** état réel du code et de la base locale, puis parcours proposé.

---

## 1. Ce qui est demandé

Un partenaire (institutionnel aujourd'hui, **média ou autre demain**) suit **le même parcours qu'une entreprise membre**, avec deux différences :

1. **C'est l'admin qui l'intègre**, pas l'entreprise qui s'inscrit elle-même.
2. **Il ne paie pas.** La contrepartie est un échange de services (visibilité, salle, logistique, couverture média…), négocié hors plateforme.

Le parcours doit rester **simple** et **générique** : ajouter demain un « Partenaire média » ne doit demander **aucun développement**. Il suffira de créer l'offre dans l'admin, avec un montant de 0.

Tout le reste est identique aux autres membres : fiche entreprise, gérant, collaborateurs dans la limite des places, accès à la plateforme, badge, participation à l'événement.

---

## 2. Principe retenu : une « offre partenaire » = une offre à 0, non proposée à l'inscription

Pas de nouveau type d'offre ni de nom écrit dans le code. Une offre est une **offre partenaire** quand, dans `/admin/plans` :

- son **montant est 0** ;
- elle **n'est pas proposée à l'inscription** (case « Proposée en libre-service » décochée).

« Partenaire Institutionnel » remplit déjà ces deux conditions. Pour un partenaire média, l'admin crée l'offre « Partenaire média » avec le même réglage : elle apparaît aussitôt dans le formulaire d'intégration (§4.1), avec son propre nombre de places par défaut et son propre badge.

---

## 3. Ce qui existe déjà et ce qui manque

### 3.1 Déjà en place

| Élément                             | État                                                                                                                 | Où                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Offre « Partenaire Institutionnel » | ✅ En base : 0 Ar, **2 places**, prix fixe, active, non proposée à l'inscription.                                    | `/admin/plans`         |
| Création d'autres offres à 0        | ✅ Le formulaire d'offre l'accepte déjà.                                                                             | `/admin/plans`         |
| Masquage des parcours libre-service | ✅ Une offre non proposée à l'inscription n'apparaît ni sur `/inscription`, ni au choix d'offre, ni en lien partagé. | `lib/plans-query.ts`   |
| Badge sur les profils               | ✅ Automatique pour une offre à prix fixe, avec son nom : « Partenaire Institutionnel », « Partenaire média »…       | `lib/offer-badge.ts`   |
| Places et invitations               | ✅ Le plafond de places s'applique déjà aux invitations.                                                             | `lib/company-seats.ts` |
| Places supplémentaires              | ✅ Un abonnement actif peut acheter des suppléments (Executive Pass, groupements), quelle que soit son offre.        | `purchaseUpsellSeats`  |
| Finances                            | ✅ Sans paiement, l'abonnement partenaire n'apparaît ni dans l'export comptable ni dans les revenus.                 | `/admin/finances`      |

### 3.2 À construire

| #   | Manque                                                                                                                                      | Conséquence aujourd'hui                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M1  | Aucun moyen pour l'admin d'inviter un partenaire sur une offre précise.                                                                     | L'admin ne peut pas intégrer un partenaire.                              |
| M2  | Un abonnement ne devient actif qu'en confirmant un paiement avec preuve.                                                                    | Impossible d'activer une offre à 0 sans fabriquer un faux paiement.      |
| M3  | Aucune page d'inscription pour un gérant invité par l'admin (l'invitation existante rattache un collaborateur à une entreprise déjà créée). | Le gérant ne peut pas créer son compte et son entreprise.                |
| M4  | Le nombre de places est celui de l'offre, sans réglage par entreprise.                                                                      | Impossible de donner 3 places à un partenaire et 2 à un autre.           |
| M5  | La contrepartie n'est enregistrée nulle part.                                                                                               | Personne ne sait plus tard ce que le partenaire apporte.                 |
| M6  | Aucune vue admin des partenaires invités.                                                                                                   | L'admin ne sait pas qui a créé son compte et qui ne l'a pas encore fait. |

---

## 4. Parcours proposé

### 4.1 L'admin invite le gérant

Bouton **« Inviter un partenaire »** dans `/admin/entreprises`. L'admin ne saisit **qu'une personne : le gérant**. Le formulaire :

| Champ                 | Obligatoire | Détail                                                                                             |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| **Nom du gérant**     | Oui         |                                                                                                    |
| **E-mail du gérant**  | Oui         | Refusé s'il correspond déjà à un compte ou à une invitation en cours.                              |
| **Offre**             | Oui         | Liste des offres partenaires (§2) : « Partenaire Institutionnel », et demain « Partenaire média »… |
| **Nombre de membres** | Non         | Prérempli avec le nombre de places de l'offre (2), modifiable pour ce partenaire (M4).             |
| **Contrepartie**      | Non         | Texte libre : services apportés en échange (M5).                                                   |

À la validation :

1. l'invitation partenaire est enregistrée (M1), **en attente** ;
2. le gérant reçoit un **e-mail d'invitation** avec un lien personnel (valable 7 jours, comme les invitations de collaborateurs) ;
3. l'action est tracée dans le journal d'audit.

Rien d'autre n'est créé à ce stade : ni entreprise, ni compte.

### 4.2 Le gérant s'inscrit via l'e-mail

Le lien ouvre une page d'inscription (M3), avec le nom et l'e-mail déjà remplis. Le gérant saisit :

- son mot de passe ;
- son entreprise : nom, secteur, pays (mêmes champs que l'inscription classique).

À la validation, en une seule opération :

1. son compte est créé, actif ;
2. son entreprise est créée, **dont il est le gérant** ;
3. l'abonnement est créé **directement actif** sur l'offre de l'invitation, sans paiement (M2), avec le nombre de membres et la contrepartie saisis par l'admin, **pour un an à partir de ce jour** (même règle que les autres offres) ;
4. l'invitation passe à « compte créé ».

Il arrive ensuite dans son espace, avec le **même parcours que les autres membres** :

- compléter la fiche entreprise ;
- **inviter ses collaborateurs lui-même**, par l'invitation habituelle, dans la limite du nombre de membres ;
- désigner les participants à l'événement (module 18).

**Au-delà du nombre de membres :** le partenaire achète des places supplémentaires **comme les autres entreprises** (Executive Pass, groupements), avec preuve de paiement et validation admin. Aucun changement à prévoir. Ces suppléments sont payants : ils apparaissent normalement dans les finances et l'export comptable.

### 4.3 Suivi par l'admin

Dans `/admin/entreprises`, une liste **« Partenaires »** (M6) montre chaque invitation avec son statut :

| Statut          | Signification                         | Actions                                 |
| --------------- | ------------------------------------- | --------------------------------------- |
| **En attente**  | E-mail envoyé, compte pas encore créé | Renvoyer l'e-mail, annuler l'invitation |
| **Expirée**     | Lien non utilisé dans les 7 jours     | Renvoyer (nouveau lien)                 |
| **Compte créé** | Le gérant s'est inscrit               | Ouvrir la fiche entreprise              |
| **Annulée**     | Invitation retirée par l'admin        | —                                       |

Sur la fiche admin d'une entreprise partenaire : l'offre, le nombre de membres et la contrepartie, modifiables.

Ailleurs, rien ne change :

- **`/admin/finances`** : l'abonnement partenaire n'y apparaît pas, puisqu'il n'y a pas de paiement ;
- **côté membres** : badge au nom de l'offre sur les profils. La contrepartie n'est jamais visible des membres.

### 4.4 Événement et Evolia

Les participants d'un partenaire **participent à l'événement CEO Summit comme ceux des autres entreprises**, et leurs informations partent vers Evolia par le même échange (module 11).

- **Pas de push d'inscription** (`company.registration.pushed`) : il sert à transmettre un montant à encaisser ou un paiement à enregistrer, et un partenaire n'a rien à payer.
- **Liste des participants** (`company.participants.confirmed`) : envoyée **comme pour toute entreprise**, quand le gérant valide la liste depuis son espace. C'est ce message qui déclenche les badges côté Evolia. Il ne contient ni mode de paiement ni montant : aucun changement de format.
- **Supplément de places acheté par un partenaire** : traité comme pour les autres entreprises (push d'inscription avec le montant du supplément, puis liste des participants mise à jour).
- **À faire au moment du codage :** ajouter une phrase dans la documentation remise à Evolia (`conception/11`, §3) pour qu'ils ne s'étonnent pas de recevoir une liste de participants sans push d'inscription préalable, pour une entreprise partenaire.

### 4.5 Hors de ce lot (parcours simple)

- Convertir en partenaire une entreprise déjà inscrite sur une offre payante. En attendant, l'admin la traite au cas par cas.
- Mise en avant publique des partenaires (section dédiée, logos).

---

## 5. Modifications techniques prévues

| Élément               | Changement                                                                                                                                                                                                                          | Effort |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Schéma                | Nouveau modèle **invitation partenaire** (nom, e-mail, offre, nombre de membres, contrepartie, jeton, statut, expiration, admin auteur, entreprise créée) ; sur l'abonnement : nombre de membres propre et contrepartie + migration | Faible |
| Règle d'offre         | `isPartnerOffer(plan)` : montant 0 et non proposée à l'inscription. Aucun nom d'offre dans le code.                                                                                                                                 | Faible |
| Places                | `seatCap` : nombre de membres de l'abonnement s'il est fixé, sinon celui de l'offre, plus les suppléments achetés                                                                                                                   | Faible |
| Action admin          | `invitePartner`, `resendPartnerInvite`, `revokePartnerInvite`, réservées à la section admin « entreprises »                                                                                                                         | Moyen  |
| Inscription du gérant | Page `/partenaire/[jeton]` et action `acceptPartnerInvite` : compte + entreprise + abonnement actif dans une transaction, invitation consommée une seule fois                                                                       | Moyen  |
| E-mail                | Nouveau modèle « invitation partenaire », modifiable dans Admin → Emails                                                                                                                                                            | Faible |
| Écrans admin          | Formulaire d'invitation, liste « Partenaires » avec statuts, nombre de membres et contrepartie sur la fiche admin                                                                                                                   | Moyen  |
| Tests                 | Règle d'offre, places, invitation (doublon, expiration, double clic), inscription du gérant, droits d'accès                                                                                                                         | Moyen  |

Estimation globale : **2 à 3 jours**, tests compris.

---

## 6. Décisions

### Tranchées le 7 octobre

| Point              | Décision                                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principe           | Intégration par l'admin, sans paiement, contrepartie en services.                                                                                                                                                                                          |
| Généricité         | Toute offre à 0, non proposée à l'inscription, est une offre partenaire. Un futur « Partenaire média » se crée dans l'admin, sans développement.                                                                                                           |
| Nombre de membres  | 2 par défaut (réglage de l'offre), **modifiable à l'intégration** pour chaque partenaire.                                                                                                                                                                  |
| Au-delà            | Achat de places supplémentaires par le parcours existant, sans changement.                                                                                                                                                                                 |
| Parcours           | L'admin n'invite **que le gérant** (nom, e-mail et offre obligatoires) ; le gérant s'inscrit via l'e-mail et crée lui-même son entreprise, puis invite ses collaborateurs par le parcours habituel. La conversion d'une entreprise existante est reportée. |
| Suivi              | L'admin voit chaque partenaire « en attente » ou « compte créé ».                                                                                                                                                                                          |
| Durée              | Même règle que les autres offres : un an à partir de l'activation, c'est-à-dire de l'inscription du gérant.                                                                                                                                                |
| Fin de partenariat | Même règle que toutes les offres : pas de statut particulier ; à l'échéance ou sur décision, l'admin gère l'abonnement comme celui de n'importe quelle entreprise.                                                                                         |
| Événement          | Les participants d'un partenaire participent à l'événement ; leur liste part vers Evolia comme pour les autres entreprises, sans push d'inscription puisqu'il n'y a rien à payer (§4.4).                                                                   |

Plus aucun point ouvert.

---

## 7. Ordre de réalisation proposé

1. Schéma, règle `isPartnerOffer` et calcul des places.
2. Invitation par l'admin et e-mail, puis page d'inscription du gérant.
3. Liste « Partenaires » et réglages sur la fiche admin.
4. Recette de bout en bout :
   - invitation d'un gérant avec 1 membres au lieu de 2 ; refus d'un e-mail déjà utilisé ;
   - statut « en attente », renvoi de l'e-mail, puis inscription du gérant et statut « compte créé » ; abonnement actif pour un an à partir de ce jour ;
   - invitation de collaborateurs par le gérant jusqu'à 3, refus de la 4ᵉ ;
   - achat d'un supplément, puis 4ᵉ invitation acceptée ;
   - badge sur le profil ;
   - absence de l'abonnement partenaire dans l'export comptable (le supplément, lui, y figure) ;
   - création d'une offre « Partenaire média » à 0 dans l'admin, puis apparition immédiate dans le formulaire d'invitation ;
   - quand l'échange Evolia sera branché : validation de la liste par le gérant, puis envoi de `company.participants.confirmed` sans push d'inscription préalable.
