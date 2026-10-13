# Module 02 — Parcours d'inscription et de paiement (B2B entreprise)

> **Statut :** En rédaction — cible produit B2B validée ; sections annotées vs l'existant implémenté (Phases 2bis/2ter/2quater)
> **Version :** 1.1 — décision du 4 août 2026 : périmètre recentré exclusivement sur l'entreprise (voir section 0)
> **Date :** Août 2026
> **Projet :** CEO Summit — Plateforme Digitale

---

## Table des matières

0. [Résumé exécutif — parcours cible validé](#0-résumé-exécutif--parcours-cible-validé)
1. [Vue d'ensemble du module](#1-vue-densemble-du-module)
2. [Personas](#2-personas)
3. [Cas d'usage](#3-cas-dusage)
4. [Parcours utilisateurs](#4-parcours-utilisateurs)
5. [Annexe — Règles métier](#annexe--règles-métier-du-module)

---

## 0. Résumé exécutif — parcours cible validé

> Source : session de cadrage du 4 août 2026. Ce résumé fait foi comme **cible produit** ; chaque point est annoté de son état d'implémentation réel, vérifié dans le code au moment de la rédaction. Les sections 1 à 5 détaillent l'implémentation actuelle ; considérer ce résumé comme le nord, pas comme une description de l'existant.

> **📌 Décision produit — pas de parcours individuel pur pour CEO Summit.** _"Un user sans entreprise ne peut pas être CEO"_ : CEO Summit est un évènement intégralement B2B — chaque inscrit est nécessairement rattaché à une entreprise (y compris un indépendant/solo, via une entreprise à un seul participant). En conséquence, le scope `Plan` **`INDIVIDUAL`** et les écrans associés (`/adhesion/paiement`, `/admin/adhesions`, `selectIndividualPlan`) sortent du **périmètre cible** de ce module. Ils restent décrits dans les sections 1 à 5 uniquement comme **référence de l'existant** (travail réel de Phase 2ter, déjà vérifié en conditions réelles) — chaque occurrence est désormais marquée **⚠️ Hors périmètre cible / déprécié pour CEO Summit**.
>
> **Décision sur le devenir du code (Phase 2ter individuel) : à supprimer.** Périmètre de suppression identifié à date (à affiner avant exécution — voir section "Écarts" en fin de document pour le détail par fichier) : modèles `Membership`/`MembershipPayment`, actions `app/actions/membership-subscription.ts` et `app/actions/admin-memberships.ts`, pages `/adhesion/paiement` et `/admin/adhesions`, la branche individuelle de `/paiement-en-attente` et `/entreprise/creer`, et les tests associés. **Non exécuté** — ce dépôt n'est pas versionné par git (pas de filet de sécurité en cas d'erreur), et la consigne donnée plus tôt dans cette session était de finir la redocumentation avant de reprendre le dev. À confirmer explicitement avant de lancer la suppression.

Le fonctionnement repose sur une distinction claire entre **l'accès à un événement** et **les avantages de la plateforme**. Une entreprise **ne peut pas utiliser ses crédits pour s'inscrire à un événement**. Les crédits sont un avantage accordé par une offre achetée (Deal Room, mises en relation, fonctionnalités de la plateforme, etc.), mais **l'accès à chaque édition d'un événement** (ex. CEO Summit 2026) nécessite obligatoirement la souscription à une offre dédiée.

> **✅ État :** structurellement conforme. `Plan.eventId` rattache une offre à une édition précise ; payer cette offre déclenche l'`EventRegistration` correspondante (voir RG ci-dessous), indépendamment de `CreditBalance` qui sert uniquement au Deal Room. Le principe "crédits ≠ droit d'entrée" est déjà respecté par construction.

#### Cas d'un utilisateur existant

1. L'utilisateur consulte les offres sur le site public du CEO Summit.
2. Il sélectionne une offre et est redirigé vers la plateforme B2B.
3. Il se connecte à son compte existant (ou réinitialise son mot de passe si nécessaire).
4. Les avantages obtenus lors des éditions précédentes étant expirés, il doit choisir une nouvelle offre pour l'édition en cours.
5. Si son entreprise est déjà enregistrée sur la plateforme, il la sélectionne simplement et passe directement au processus de paiement.
6. Il transmet les informations ou justificatifs de paiement.
7. L'administrateur valide ensuite la demande avant d'activer les droits associés à l'offre.

> **🔄 État :** mécanisme bas niveau existant (`selectPlan` permet de choisir une nouvelle offre tant que le statut n'est pas `ACTIVE`), mais **la logique de renouvellement par édition n'existe pas encore — décidée ci-dessous.**
>
> **✅ Décision :** `CompanySubscriptionStatus` gagne une valeur `EXPIRED`. Une souscription passe automatiquement de `ACTIVE` à `EXPIRED` quand l'offre payée est une offre d'évènement (`Plan.eventId` non nul) et que la date de l'évènement lié est dépassée — vérifié à la lecture (pas de job planifié requis, un simple calcul dérivé à chaque accès suffit). `hasCompanyAccess` traite `EXPIRED` comme "pas d'accès actif" (même traitement que l'absence de souscription), et `selectPlan` est mis à jour pour autoriser une nouvelle sélection quand le statut est `EXPIRED` (pas seulement `PENDING_PAYMENT`/`PENDING_REVIEW` comme aujourd'hui). Les offres **plateforme** (`eventId` nul) n'expirent jamais par ce mécanisme — seuls les avantages "édition" expirent, les avantages plateforme (crédits, Deal Room) persistent tant qu'ils ne sont pas explicitement révoqués par un admin.

#### Cas d'un nouvel utilisateur

1. L'utilisateur sélectionne une offre sur le site public puis est redirigé vers la plateforme.
2. Il crée son compte.
3. Après son inscription, il accède à son tableau de bord où un message l'informe qu'aucune entreprise n'est encore enregistrée.
4. Il crée son entreprise et renseigne les informations nécessaires.
5. Il reprend ensuite le processus de souscription à l'offre qu'il avait initialement choisie.

> **✅ État :** conforme dans l'esprit. Le mécanisme réel passe par `/bienvenue` (tutoriel) puis `/dashboard`, que le middleware intercepte et renvoie vers `/paiement-en-attente` tant qu'aucune adhésion/entreprise active n'existe — le résultat perçu (dashboard → message → création entreprise → offre retrouvée via `intendedPlanId`) correspond à ce résumé. Voir Parcours B.

#### Modification de l'offre avant paiement

Tant que le paiement n'a pas été validé, l'utilisateur doit pouvoir **modifier librement son offre** — par exemple commencer avec l'offre "Light corporate pass", puis décider, avant le paiement, de passer à "Premium corporate pass" pour inscrire davantage de collaborateurs. Le système recalcule alors automatiquement les avantages associés (nombre de crédits, accès, quotas de collaborateurs, etc.) avant de poursuivre le processus de paiement.

> _(Le scope individuel étant retiré du périmètre cible — voir décision ci-dessus — le changement de plan à documenter est désormais uniquement un changement **entre offres entreprise**, pas un changement de scope individuel ↔ entreprise.)_

> **🔄 État : non conforme.** Écart vérifié dans le code : `/entreprise/paiement` (`app/entreprise/paiement/page.tsx:32-58`) n'affiche que l'offre déjà choisie, sans liste des autres offres entreprise — changer d'offre demande d'aller sur une page séparée (`/entreprise/abonnement`), et **c'est bloqué une fois la preuve soumise** (statut `PENDING_REVIEW`).
>
> **✅ Décision :** `/entreprise/paiement` affiche désormais la liste des autres offres entreprise disponibles (même composant que `/entreprise/abonnement`, fusionnés en un seul écran) — changer d'offre reste possible **à tout moment tant que le statut n'est pas `ACTIVE`**, y compris après soumission d'une preuve. Changer d'offre alors qu'une preuve est en `PENDING_REVIEW` **réinitialise automatiquement le statut à `PENDING_PAYMENT`** et invalide la preuve précédente (montant lié à l'ancienne offre) — l'entreprise doit soumettre une nouvelle preuve pour la nouvelle offre. Pas de notification spéciale à l'admin nécessaire : la demande disparaît simplement de sa file "à valider" jusqu'à la nouvelle soumission.

#### Validation finale

Une fois les justificatifs de paiement envoyés : la demande passe en attente de validation ; un administrateur vérifie le paiement ; après validation, l'offre est activée et les avantages correspondants (crédits, accès au Deal Room, fonctionnalités de la plateforme, etc.) sont attribués **à l'entreprise**.

> **🔄 État : non conforme.** `confirmCompanyPayment` (`admin-companies.ts:44-53`) ne touche jamais `CreditBalance` — contrairement à `confirmMembershipPayment` qui l'alimente. Un commentaire dans le code le confirme explicitement : pool de crédits entreprise = "Phase 3, pas encore posé."
>
> **✅ Décision :** `confirmCompanyPayment` doit alimenter `CreditBalance` **au niveau de l'entreprise** (un pool partagé, pas un solde individuel par collaborateur), lu depuis l'offre plateforme liée (`Plan.linkedPlatformPlanId` — voir UC-10) si elle existe, sinon depuis l'offre payée elle-même (rétrocompatibilité le temps de la migration). La répartition du pool entre collaborateurs (qui peut consommer combien) reste un mécanisme à part entière, hors périmètre de ce module — mais l'alimentation initiale du pool à la validation, elle, est désormais dans le périmètre cible et n'est plus reportée à une "Phase 3" indéterminée.

**Principe clé :** les offres sont **temporaires** et liées à une édition de l'événement. Les comptes utilisateurs et les entreprises restent enregistrés sur la plateforme d'une année à l'autre, mais les droits et avantages doivent être renouvelés via la souscription d'une nouvelle offre pour chaque édition, ou par achat dans la plateforme pour un usage propre à la plateforme (indépendant des éditions).

> **✅ État :** conforme structurellement. `Plan.eventId` distingue déjà une offre d'édition (`eventId` non nul) d'une offre plateforme générique (`eventId: null`), et `app/actions/credits.ts` (achat de crédits, `requestCreditPurchase`/`confirmCreditPurchase`) est bien un mécanisme indépendant de tout évènement, modifiable en admin via `CreditPackPrice`. La persistance des comptes/entreprises d'une édition à l'autre n'a pas été testée explicitement mais suit naturellement du modèle de données (aucune suppression automatique constatée).

---

## 1. Vue d'ensemble du module

Ce module documente le **parcours réel** par lequel un dirigeant rejoint un évènement CEO Summit (ou l'adhésion plateforme), depuis la découverte d'une offre jusqu'à l'activation de son accès après validation du paiement. Contrairement au [Module 01](01_onboarding_acces.md) qui décrit un onboarding par invitation/parrainage/sélection directe pour le **cercle privé**, ce module couvre le parcours **commercial** : choix d'une offre payante (individuelle ou entreprise), inscription, et validation du paiement par preuve (pas de passerelle bancaire automatisée — tout est vérifié manuellement par un admin).

### ⚠️ Point d'ancrage important — où commence réellement ce parcours

Il **n'existe pas**, dans ce dépôt, de page publique "Événement" listant les offres avec un vrai clic "s'inscrire". Cette vitrine (catalogue "Engagement 2025 — CEO Summit", pass individuel Executive + pass entreprise Light/Medium/Premium/Ultimate à prix dégressif par participant + sponsoring) vit sur le **site public vitrine, un workstream séparé, hors de ce dépôt**.

Le pont entre les deux est un **lien profond** : chaque offre (`Plan`) a un `slug` unique, et le site vitrine pointe vers `/inscription?offre=<slug>` dans cette application. C'est donc _ce lien_ qui matérialise "l'utilisateur clique sur l'évènement et voit l'offre" — le clic sur les _différentes_ offres et la comparaison entre elles se fait sur le site vitrine externe, pas ici (sauf pour le parcours organique, voir Cas 2 et 4, où la fourche d'offres est affichée in-app faute de lien profond).

**Implication pour ce document** : les parcours ci-dessous démarrent soit au clic sur le lien profond externe (cas nominal attendu), soit à une arrivée organique sur `/inscription` sans offre pré-choisie (fallback in-app).

### Deux familles d'offres, un seul moteur

> ⚠️ **Colonne "Individuel" hors périmètre cible / dépréciée pour CEO Summit** (voir décision section 0) — conservée ici uniquement comme référence de l'existant implémenté en Phase 2ter.

|                       | ~~Individuel (adhésion)~~ ⚠️ déprécié          | Entreprise                                                                                    |
| --------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Offre**             | `Plan` scope `INDIVIDUAL`, prix forfaitaire/an | `Plan` scope `COMPANY`, prix **par participant**/an + seuil minimum de participants           |
| **Écran de paiement** | `/adhesion/paiement`                           | `/entreprise/paiement`                                                                        |
| **Validation admin**  | `/admin/adhesions`                             | `/admin/entreprises`                                                                          |
| **Crédits Deal Room** | Attribués à la confirmation admin              | Hors périmètre (prévu Phase 3)                                                                |
| **Cas particulier**   | —                                              | Doit atteindre son seuil minimum de collaborateurs réellement inscrits avant de pouvoir payer |

> **Note sur le modèle de prix entreprise** : dans le schéma actuel, **toute** offre `COMPANY` est en tarification "par participant" (`Plan.priceAr` × nombre réel de collaborateurs, `Plan.minParticipants` en seuil plancher). Il n'existe pas encore de mode "forfait fixe pour N sièges" — voir la [décision](#-décision--deux-modes-de-tarification-entreprise-fixe-vs-par-participant--à-implémenter) à ce sujet.

Une offre peut aussi être rattachée à un évènement précis (`Plan.eventId`) plutôt qu'être une offre générique plateforme — dans ce cas, la confirmation du paiement inscrit automatiquement le/les membres à l'évènement en plus d'activer l'adhésion. Le sponsoring (`isSelfService = false`) est **exclu** de tout ce parcours self-service : ces deals sont négociés et suivis manuellement en back-office.

### Acteurs du module

| Acteur                           | Rôle                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| **Candidat individuel**          | Dirigeant qui rejoint à titre personnel                           |
| **Candidat entreprise (payeur)** | Dirigeant qui inscrit son entreprise et devient admin entreprise  |
| **Collaborateur invité**         | Membre de l'entreprise invité à rejoindre pour atteindre le seuil |
| **Admin CEO Summit**             | Valide ou refuse les preuves de paiement                          |

---

## 2. Personas

### 👤 Persona A — Hery, le dirigeant individuel pressé ⚠️ _(hors périmètre cible — déprécié, voir section 0)_

- **Profil :** Directeur Général d'une PME de services, 41 ans, Madagascar
- **Contexte :** Voit l'offre "Executive pass" sur le site vitrine CEO Summit, clique dessus.
- **Motivation :** Rejoindre vite, sans paperasse superflue.
- **Frein :** N'a pas de moyen de paiement en ligne instantané dans son contexte — doit faire un virement puis prouver le paiement.

### 👤 Persona B — Fanja, la dirigeante qui inscrit son entreprise

- **Profil :** PDG d'un groupe de 15 collaborateurs cadres, 47 ans, Madagascar
- **Contexte :** Voit l'offre "Light corporate pass" (prix dégressif par participant, seuil 10) sur le site vitrine, veut inscrire son comité de direction.
- **Motivation :** Faire bénéficier son équipe de direction du réseau et du Deal Room.
- **Frein (implémentation actuelle) :** doit convaincre/rassembler au moins 10 collaborateurs **réellement inscrits** avant de pouvoir payer — le parcours doit rendre ce blocage clair, pas frustrant. Voir la [décision](#-décision--payer-avant-de-rassembler-les-collaborateurs--à-implémenter) pour un parcours alternatif qui lève ce frein.

### 👤 Persona C — Admin CEO Summit

- **Profil :** Membre de l'équipe CEO Summit chargé de la vérification des paiements
- **Besoin :** Voir en un coup d'œil qui a soumis une preuve, combien est dû, et valider/refuser avec un motif clair.

---

## 3. Cas d'usage

### UC-01 — Découverte d'une offre et clic vers l'inscription (site vitrine → app)

**Description :** Un visiteur du site vitrine public CEO Summit consulte le catalogue d'offres (individuelles ou entreprise) et clique sur celle qui l'intéresse.
**Acteur principal :** Visiteur (futur candidat)
**Déclencheur :** Navigation sur le site vitrine externe
**Résultat attendu :** Redirection vers `/inscription?offre=<slug>` dans l'application, avec l'offre déjà identifiée.
**Hors périmètre de ce dépôt** : l'affichage du catalogue et la comparaison des offres eux-mêmes (site vitrine séparé).

---

### UC-02 — Inscription individuelle (via lien profond ou organique) ⚠️ _(hors périmètre cible — déprécié, voir section 0)_

**Description :** Un candidat crée son compte, avec ou sans offre déjà connue.
**Acteur principal :** Candidat individuel (Persona A)
**Résultat attendu :** Compte créé, connexion automatique (pas d'email d'activation à attendre), arrivée sur le tutoriel `/bienvenue` puis sur `/paiement-en-attente`.

---

### UC-03 — Choix de l'offre après inscription (fourche individuel / entreprise) ⚠️ _(fourche à supprimer — voir décision section 0)_

**Description (existant) :** Si aucune offre n'était connue au moment de l'inscription (arrivée organique), l'utilisateur choisit sur `/paiement-en-attente` entre une offre individuelle ou la création d'une entreprise.
**Acteur principal :** Candidat
**Précondition :** `User.intendedPlanId` est vide.
**Résultat attendu (existant) :** Redirection vers `/adhesion/paiement` (offre individuelle choisie) ou `/entreprise/creer` (parcours entreprise).
**🔄 Cible :** plus de fourche — `/paiement-en-attente` doit mener systématiquement vers `/entreprise/creer` (aucun utilisateur sans entreprise).

---

### UC-04 — Création de la fiche entreprise

**Description :** Le candidat entreprise choisit son offre (pré-sélectionnée si lien profond) puis renseigne les informations de son entreprise.
**Acteur principal :** Candidat entreprise (Persona B)
**Résultat attendu :** Fiche entreprise créée, le candidat devient admin entreprise, arrivée sur `/entreprises/[id]` avec un suivi de statut de dossier.

---

### UC-05 — Atteinte du seuil minimum de participants

**Description :** L'admin entreprise invite des collaborateurs jusqu'à atteindre le seuil minimum exigé par l'offre choisie ; tant que ce seuil n'est pas atteint par des comptes réellement créés (pas de simples invitations en attente), le paiement reste bloqué.
**Acteur principal :** Candidat entreprise + collaborateurs invités
**Résultat attendu :** Seuil atteint → montant dû calculé automatiquement (nombre réel de participants × prix unitaire) → paiement débloqué.

---

### UC-06 — Soumission de la preuve de paiement

**Description :** L'admin entreprise (ou l'individuel) effectue le paiement hors plateforme (virement, mobile money) puis uploade une preuve (image/PDF).
**Acteur principal :** Candidat entreprise ou individuel
**Résultat attendu :** Statut passe à "en attente de validation admin".

---

### UC-07 — Validation admin du paiement

**Description :** L'admin CEO Summit examine la preuve et le montant déclaré, puis valide ou refuse avec un motif.
**Acteur principal :** Admin CEO Summit (Persona C)
**Résultat attendu :** Si validé — accès activé pour tous les comptes concernés, crédits Deal Room attribués (individuel), inscription à l'évènement le cas échéant. Si refusé — motif transmis, l'utilisateur peut re-soumettre.

---

### UC-08 — Gestion des offres en back-office (création, édition, rattachement à un évènement)

**Description :** Depuis `/admin/plans`, l'admin CEO Summit crée et configure les offres proposées aux candidats (individuelles ⚠️ déprécié, ou entreprise), et peut les rattacher à une édition d'évènement précise.
**Acteur principal :** Admin CEO Summit (Persona C)
**Résultat attendu :** Offre visible (si active + self-service) dans les écrans self-service (`/inscription?offre=`, fourche, wizard entreprise) et dans le back-office. Détail complet dans le parcours ci-dessous (section 4).

---

### 🔄 UC-09 (proposition, non implémentée) — Configuration du mode de tarification d'une offre entreprise

**Description :** Depuis `/admin/plans`, l'admin choisit, pour une offre `COMPANY`, si elle est en **forfait fixe** (N sièges inclus pour un prix total) ou en **tarification ouverte** (prix par participant, comme aujourd'hui).
**Acteur principal :** Admin CEO Summit
**Résultat attendu :** Le formulaire d'offre affiche des champs différents selon le mode choisi, et `/entreprise/paiement` calcule/affiche le montant dû en conséquence. Détail complet ci-dessous.

---

### 🔄 UC-10 (proposition, non implémentée) — Associer une offre d'évènement à une offre plateforme

**Description :** En créant une offre rattachée à un évènement (`eventId` non nul), l'admin la lie à une **offre plateforme** existante (`eventId` nul) qui définit les avantages réels (crédits, accès Deal Room, quotas). Payer l'offre d'évènement attribue automatiquement les avantages de l'offre plateforme liée — pas besoin de reconfigurer les avantages à chaque édition.
**Acteur principal :** Admin CEO Summit
**Résultat attendu :** Une même offre plateforme ("Business") peut être réutilisée par plusieurs offres d'évènement différentes ("Entreprise Gold — CEO Summit 2027", "Entreprise Gold — CEO Summit 2028", etc.), sans dupliquer la configuration des avantages à chaque fois. Détail complet ci-dessous.

---

### 🔄 UC-11 (décidé, non implémenté) — Partager une offre en dehors de la plateforme

**Description :** Depuis `/admin/plans`, l'admin obtient facilement le lien profond public d'une offre (à copier, ou sous forme de QR code) pour le diffuser hors de l'app (WhatsApp, email, réseaux sociaux, flyer) ; le lien lui-même affiche un aperçu correct (description, image) et génère une preview correcte quand il est partagé sur les réseaux sociaux.
**Acteur principal :** Admin CEO Summit
**Résultat attendu :** Un lien copiable/scannable directement depuis l'admin, une page d'inscription publique qui montre plus que le nom et le prix, et un aperçu de partage (Open Graph) présentable sur WhatsApp/Facebook/LinkedIn. Détail complet ci-dessous.

---

## 4. Parcours utilisateurs

### Parcours A — Hery rejoint le CEO Summit à titre individuel (lien profond) ⚠️ _(hors périmètre cible — déprécié, voir section 0 ; conservé comme référence de l'existant Phase 2ter)_

```
[Site vitrine public → catalogue d'offres]
        ↓ clic sur "Executive pass"
[/inscription?offre=executive-pass]
  → Bandeau doré : "Vous vous inscrivez pour : Executive pass — 2 500 000 Ar / an"
        ↓
[Formulaire : nom, email, mot de passe] → S'inscrire
        ↓
[Connexion automatique — pas d'email à confirmer]
        ↓
[/bienvenue — tutoriel onboarding profil]
        ↓
[/paiement-en-attente]
  → Offre déjà connue : PAS de fourche, directement
    "Vous vous êtes inscrit pour Executive pass (2 500 000 Ar/an)"
  → Bouton "Continuer vers le paiement"
        ↓
[/adhesion/paiement]
  → Montant dû : 2 500 000 Ar (pas de saisie libre du montant)
  → Upload preuve (image/PDF) + choix du mode de paiement
        ↓ Soumettre pour validation
["Preuve transmise, en attente de validation"]
        ↓
[UC-07 — Admin valide sur /admin/adhesions]
        ↓
[Accès activé + crédits Deal Room attribués selon l'offre]
```

---

### Parcours B — Fanja inscrit son entreprise (lien profond, avec seuil)

```
[Site vitrine public → catalogue d'offres entreprise]
        ↓ clic sur "Light corporate pass" (2 250 000 Ar/participant, seuil ≥10)
[/inscription?offre=light-corporate]
  → Bandeau doré affichant l'offre et son prix par participant
        ↓
[Formulaire d'inscription] → S'inscrire → connexion automatique
        ↓
[/bienvenue — tutoriel]
        ↓
[/paiement-en-attente]
  → Offre déjà connue → lien direct vers /entreprise/creer
        ↓
[/entreprise/creer — Étape 1]
  → Carte "Light corporate pass" déjà pré-sélectionnée (modifiable)
        ↓ Suivant →
[/entreprise/creer — Étape 2]
  → Nom, secteur, pays, logo, téléphone, adresse, réseaux sociaux
        ↓ Soumettre
[/entreprises/[id]] — Fanja est admin entreprise
  → Onglet "Gestion" : statut du dossier
    ✅ Offre sélectionnée   ✅ Entreprise renseignée
        ↓
[Fanja va sur /entreprise/paiement SANS avoir invité personne]
  → "1 participant(s) × 2 250 000 Ar" — Montant dû : 2 250 000 Ar
  → ⚠️ "Il manque 9 collaborateur(s) pour atteindre le seuil minimum de 10"
  → Bouton "Soumettre" désactivé, même avec une preuve uploadée
        ↓
[Retour à /entreprises/[id] → Inviter des collaborateurs]
  → Fanja invite 9 collaborateurs (emails d'invitation envoyés)
  → Chacun ouvre /invitation/[token], choisit un mot de passe,
    connexion automatique (pas de second email à confirmer)
        ↓ (invitations encore "en attente" = ne comptent PAS dans le seuil)
[Une fois les 9 acceptées → 10 comptes réels au total]
        ↓
[/entreprise/paiement]
  → Message de seuil manquant disparu
  → Montant dû : 22 500 000 Ar (2 250 000 × 10)
  → Upload preuve + mode de paiement → Soumettre (bouton actif)
        ↓
["Preuve transmise, en attente de validation"]
        ↓
[UC-07 — Admin valide sur /admin/entreprises]
  → Badge "À valider" → "✓ Valider" (ou "✗ Refuser" + motif → re-soumission possible)
        ↓
[Les 10 comptes ont accès complet à la prochaine connexion]
```

---

### Parcours Admin — Créer et configurer une offre (`/admin/plans`)

**Écrans** : `/admin/plans` (liste) → `/admin/plans/nouveau` (création) → `/admin/plans/[id]/editer` (édition)

```
[/admin/plans — liste]
  → Colonnes : Offre (+ "Max N collaborateur(s)" si maxTeamMembers défini),
    Portée (INDIVIDUAL/COMPANY), Prix, Crédits inclus ("Illimité" ou nombre),
    Rang, Statut (Active/Inactive)
  → Si arrivée via ?eventId=... (lien depuis la fiche évènement) : liste
    filtrée sur les offres de cet évènement + lien "Voir toutes les offres"
        ↓ "Nouvelle offre"
[/admin/plans/nouveau]
  → Nom → le slug se pré-remplit automatiquement (dérivé du nom, modifiable,
    verrouillé en kebab-case) tant qu'il n'a pas été modifié à la main
  → Description
  → Portée : Individuelle ⚠️ (dépréciée) / Entreprise
  → Évènement : liste déroulante, "Aucun — offre standard plateforme" par défaut
    (pré-rempli si arrivée via ?eventId=...)
  → Prix (Ar), Rang
  → SI Portée = Entreprise seulement : "Plafond de collaborateurs" +
    "Seuil minimum de participants" (avec l'indication "le prix s'applique
    par participant, pas au total")
  → Crédits inclus (désactivé si "Crédits illimités" coché) + case
    "Crédits illimités"
  → Note d'éligibilité
  → Ordre d'affichage + case "Active"
  → Case "Parcours self-service" (cochée par défaut) — libellé exact :
    "Parcours self-service (décocher pour le sponsoring — suivi admin
    uniquement, pas de paiement en ligne)"
        ↓ Enregistrer
[Vérification serveur : slug déjà utilisé ?]
  → Si oui : "Ce slug est déjà utilisé par une autre offre." (refus)
  → Si non : offre créée, retour à la liste
        ↓
[Offre visible dans les écrans self-service si Active + Self-service]
  (résolution de lien profond, fourche, wizard entreprise)
```

**Suppression vs désactivation** : une offre déjà utilisée (au moins un `User`/`Membership` qui la référence) **ne peut pas être supprimée** — message _"Ce plan est utilisé par N membre(s)/M adhésion(s) — désactive-le au lieu de le supprimer."_ Seule une offre jamais utilisée peut être supprimée définitivement. Désactiver une offre (case "Active" décochée) ne touche **aucun** compte déjà inscrit dessus — ça la retire seulement des catalogues futurs.

**Lien bidirectionnel avec l'évènement** : depuis la fiche évènement (`/admin/evenements/[id]/editer`), un lien _"Offres de cet évènement (N) →"_ mène vers `/admin/plans?eventId=...`, et créer une offre depuis là pré-remplit son `eventId`.

> **Note pour la décision "individuel supprimé" (section 0)** : le formulaire propose toujours "Individuelle" dans le sélecteur de portée — si le scope `INDIVIDUAL` est retiré du produit, ce choix devra être retiré du formulaire admin également (pas seulement des écrans self-service), sans quoi un admin pourrait encore créer une offre individuelle orpheline.
>
> **Note pour la proposition UC-09 (mode de tarification fixe/ouvert)** : la validation actuelle (`lib/validations/plan.ts`) n'impose déjà **aucune** contrainte serveur liant `minParticipants`/`maxTeamMembers` au scope — seul l'affichage conditionnel du formulaire fait cette distinction aujourd'hui (champs masqués si scope ≠ Entreprise, mais pas bloqués côté serveur). Ajouter un champ `pricingMode` suivrait exactement ce même patron (affichage conditionnel dans `plan-form.tsx`), cohérent avec l'existant.

---

### 🔄 Décision — Séparer offres plateforme et offres d'évènement (réutilisation des avantages) — à implémenter

> **Statut : décidé le 4 août 2026, à implémenter.** Aujourd'hui, `Plan.eventId` distingue déjà "offre standard plateforme" (`null`) d'"offre propre à un évènement" (non nul), mais **tous les champs vivent sur la même ligne** : une offre d'évènement porte elle-même son propre `includedCredits`/`hasUnlimitedCredits`/`maxTeamMembers` — il n'y a aucun lien entre une offre d'évènement et une offre plateforme. Chaque nouvelle édition oblige donc à ressaisir la configuration des avantages depuis zéro.

**Idée** : distinguer clairement deux rôles pour `Plan` et les relier par une référence :

- **Offre plateforme** (`eventId = null`) : définit les **avantages permanents** — crédits, accès Deal Room, fonctionnalités, quotas de collaborateurs (`maxTeamMembers`).
- **Offre d'évènement** (`eventId` non nul) : définit les **modalités d'accès à cette édition** — prix (`priceAr`), seuil minimum de participants (`minParticipants`), note d'éligibilité — et référence une offre plateforme via un nouveau champ, ex. `Plan.linkedPlatformPlanId` (auto-référence nullable, pertinente seulement quand `eventId` est renseigné).

À la confirmation du paiement (`confirmCompanyPayment`/`confirmMembershipPayment`), les avantages accordés (crédits, quotas) sont lus sur l'**offre plateforme liée**, pas sur l'offre d'évènement elle-même.

| Champ                                     | Offre plateforme (`eventId = null`)                                                              | Offre d'évènement (`eventId` ≠ null)                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `priceAr`                                 | Sans objet (pas de vente directe si non self-service) ou prix du renouvellement/achat plateforme | Tarif de cette édition                                                |
| `minParticipants`                         | —                                                                                                | Seuil d'accès pour cette édition (mode `PER_PARTICIPANT`, voir UC-09) |
| `includedSeats` (nouveau, voir UC-09)     | —                                                                                                | Nombre de sièges du forfait (mode `FIXED_BUNDLE`)                     |
| `includedCredits` / `hasUnlimitedCredits` | Avantage accordé                                                                                 | — (lu depuis l'offre liée)                                            |
| `maxTeamMembers`                          | Quota de collaborateurs de l'avantage plateforme                                                 | — (lu depuis l'offre liée, jamais son propre champ)                   |
| `linkedPlatformPlanId` (nouveau)          | —                                                                                                | Référence vers l'offre plateforme dont hériter les avantages          |

```
[/admin/plans/nouveau — création d'une offre d'évènement]
  → Portée : Entreprise, Évènement : "CEO Summit 2027"
  → Nom : "Entreprise Gold — CEO Summit 2027"
  → Prix, seuil minimum : propres à cette édition
  → Nouveau champ : "Offre plateforme associée" → sélection "Business"
    (liste des offres plateforme actives, eventId = null)
        ↓ Enregistrer
[Offre créée, liée à "Business"]
        ↓
[Un participant paie "Entreprise Gold — CEO Summit 2027"]
        ↓
[UC-07 — Admin valide le paiement]
  → Avantages accordés = ceux de "Business" (crédits, accès Deal Room,
    quotas), pas besoin de les avoir resaisis sur l'offre 2027
        ↓
[La même offre "Business" peut aussi être liée à "Entreprise Gold —
 CEO Summit 2028" l'année suivante, sans dupliquer sa configuration]
```

**Décisions (résolues le 4 août 2026)** :

- **Interaction avec UC-09 (mode de tarification) — tranchée.** `pricingMode` (`PER_PARTICIPANT`/`FIXED_BUNDLE`) est un attribut de l'**offre d'évènement uniquement** (comment facturer _cette édition_) — les offres plateforme n'ont pas de `pricingMode`, elles ne se vendent jamais directement par ce mécanisme (le rachat de crédits plateforme reste géré par `CreditPackPrice`/`credits.ts`, un système déjà séparé). Pour éviter toute ambiguïté avec `maxTeamMembers` (quota plateforme), le nombre de sièges d'un forfait d'évènement (`FIXED_BUNDLE`) porte un **nom de champ distinct** : `Plan.includedSeats` (nouveau, propre à l'offre d'évènement — nombre d'inscrits _à cette édition_), différent de `Plan.maxTeamMembers` (propre à l'offre plateforme — nombre de collaborateurs autorisés à profiter de l'avantage plateforme, indépendant de toute édition). Les deux quotas ne se confondent plus.
- **`maxTeamMembers` sur une offre d'évènement** : devient un champ mort une fois la migration faite (voir point suivant) — toute lecture de quota de collaborateurs sur une souscription d'entreprise doit passer par `subscription.plan.linkedPlatformPlan.maxTeamMembers` (`company-invites.ts` à mettre à jour en conséquence).
- **Rétrocompatibilité** : le lien `linkedPlatformPlanId` devient **obligatoire côté validation serveur** pour toute nouvelle offre d'évènement créée après cette évolution. Pour les offres d'évènement déjà existantes (Phase 2quater, sans lien) : migration ponctuelle qui crée, pour chacune, une offre plateforme équivalente (dupliquant ses `includedCredits`/`hasUnlimitedCredits`/`maxTeamMembers` actuels) et renseigne `linkedPlatformPlanId` en conséquence — pas de branche de repli permanente à maintenir dans le code applicatif après la migration.
- **Suppression d'une offre plateforme référencée** : bloquée, même règle que la protection déjà en place contre la suppression d'une offre utilisée par des `User`/`Membership` (`deletePlan`) — étendre le même garde-fou aux offres d'évènement qui la référencent via `linkedPlatformPlanId`. La **désactivation** (`isActive = false`) reste possible : l'offre plateforme continue d'honorer les avantages déjà accordés, mais disparaît du sélecteur proposé lors de la création de _nouvelles_ offres d'évènement.

---

### 🔄 Décision — Payer avant de rassembler les collaborateurs — à implémenter

> **Statut : décidé le 4 août 2026, à implémenter.** Remplace le comportement actuel décrit au Parcours B (paiement bloqué tant que le seuil n'est pas atteint par des comptes réellement créés).

**Idée** : ne plus obliger l'admin entreprise à _rassembler d'abord_ ses collaborateurs pour débloquer le paiement. À la place, il **déclare** le nombre de participants prévus, paie sur cette base, puis invite ses collaborateurs _après coup_, à son rythme, depuis son espace. Chaque collaborateur invité reçoit automatiquement son accès (et son QR code d'évènement) dès qu'il accepte son invitation — sans étape de validation admin supplémentaire par collaborateur.

```
[/entreprise/creer — Étape 1 : choisir l'offre] → Suivant →
[/entreprise/creer — Étape 2 : infos entreprise] → Soumettre
        ↓
[/entreprises/[id]] — Fanja est admin entreprise
        ↓
[/entreprise/paiement]
  → Nouveau champ : "Nombre de participants prévus" (≥ seuil minimum de l'offre,
    ex. 10 pour Light corporate) — saisi par Fanja, PAS déduit des comptes réels
  → Montant dû calculé sur ce nombre déclaré : 2 250 000 × 10 = 22 500 000 Ar
  → Upload preuve + mode de paiement → Soumettre (plus de blocage par seuil réel)
        ↓
["Preuve transmise, en attente de validation"]
        ↓
[UC-07 — Admin valide sur /admin/entreprises]
  → Vérifie que le montant déclaré correspond bien au nombre annoncé × prix unitaire
  → "✓ Valider" → Fanja (payeuse) obtient un accès complet immédiatement
        ↓
[Fanja retourne dans son espace, à son rythme → Inviter des collaborateurs]
  → Elle peut inviter jusqu'au nombre de sièges payés (pas au-delà, sans repayer)
        ↓
[Chaque collaborateur ouvre /invitation/[token], choisit un mot de passe]
        ↓ automatique, dès l'acceptation — sans repasser par un admin
[Accès complet accordé + QR code d'évènement généré pour ce collaborateur]
```

> **⚠️ Écart bloquant trouvé le 4 août 2026, à corriger avant d'implémenter cette proposition.** Vérifié dans le code : `confirmCompanyPayment` (`admin-companies.ts:62-80`) ne crée une `EventRegistration` (condition d'accès au badge QR, vérifiée strictement par `/evenements/[id]/badge`) **que pour les collaborateurs déjà rattachés à l'entreprise au moment de la confirmation du paiement** — un commentaire dans le code le dit explicitement : _"un collaborateur invité après coup n'est pas rétroactivement inscrit à l'évènement."_ Et `acceptCompanyInvite` (`company-invites.ts:129-178`) ne crée jamais d'`EventRegistration` à l'acceptation d'une invitation. Résultat : dans le monde actuel, un collaborateur invité après confirmation n'a **jamais** de badge QR — un cas déjà possible aujourd'hui mais traité comme un cas limite acceptable. Cette proposition en fait le **cas nominal** (on invite systématiquement après paiement) — sans correctif, **aucun** collaborateur n'obtiendrait jamais de badge.
>
> **✅ Décision :** `acceptCompanyInvite` doit, après avoir rattaché l'utilisateur à l'entreprise, vérifier si `company.subscription.status === "ACTIVE"` et si l'offre est liée à un évènement (`Plan.eventId` non nul) — si oui, créer l'`EventRegistration` du nouveau collaborateur à ce moment-là (même logique que celle déjà appliquée par lot dans `confirmCompanyPayment`, mais déclenchée à l'acceptation plutôt qu'à la confirmation). Ce correctif profite aussi au cas déjà existant aujourd'hui (collaborateur invité après confirmation), pas seulement à cette proposition.

**Décisions (résolues le 4 août 2026)** :

- **Moins de collaborateurs invités que payé** : sièges non utilisés = perdus, pas de remboursement ni de report sur une autre édition (cohérent avec un billet d'évènement classique). **Plus de collaborateurs que payé** : refusé à l'invitation dès que le plafond déclaré (ou `includedSeats` en mode forfait — voir proposition suivante) est atteint, même message de refus explicite que le plafond `maxTeamMembers` actuel (`company-invites.ts`), pas de surcoût automatique.
- **Montant déclaré verrouillé dès l'upload de la preuve** — cohérent avec la décision prise plus haut sur le changement d'offre : pour modifier le nombre déclaré après soumission, il faut d'abord changer d'offre ou resoumettre, ce qui repasse le dossier en `PENDING_PAYMENT`.
- **Vérification a posteriori par l'admin** : oui, mais légère — `/admin/entreprises` affiche un indicateur "X/Y sièges utilisés" (invités réels vs nombre déclaré) sur la fiche entreprise, à titre d'information. Pas de blocage ni d'action automatique en cas d'écart — l'admin peut relancer l'entreprise manuellement s'il juge l'écart suspect.
- **Remplace complètement le calcul par seuil réel** pour les offres en mode `PER_PARTICIPANT` — le nombre déclaré devient la seule source de vérité du montant dû ; le nombre réellement invité redevient une donnée de suivi/visibilité admin, plus un verrou de paiement (RG-04/RG-05/RG-06 mises à jour en Annexe).

---

### 🔄 Décision — Deux modes de tarification entreprise (fixe vs par participant) — à implémenter

> **Statut : décidé le 4 août 2026, à implémenter.** Aujourd'hui, `Plan` (scope `COMPANY`) n'a qu'un seul mode : `priceAr` toujours interprété comme un prix **par participant**, `minParticipants` comme seuil plancher, `maxTeamMembers` comme simple plafond d'invitations (pas un forfait). Certaines offres ont besoin d'un nombre de collaborateurs **fixe** (prix unique pour un groupe donné), d'autres restent **ouvertes** (prix qui varie selon le nombre de participants, comme aujourd'hui) — les deux doivent pouvoir être configurées offre par offre, y compris pour les offres rattachées à un évènement (`Plan.eventId`).

**Idée** : ajouter un champ de mode sur les offres d'évènement (`Plan.eventId` non nul) uniquement, ex. `pricingMode` : `PER_PARTICIPANT` (comportement actuel, inchangé) ou `FIXED_BUNDLE` (forfait). En mode `FIXED_BUNDLE`, un nouveau champ **`includedSeats`** porte le "nombre de sièges inclus dans le forfait" et `priceAr` devient un **montant total fixe** (pas multiplié par le nombre réel de collaborateurs) ; `minParticipants` n'a plus de sens et devrait être masqué dans le formulaire. _(`includedSeats` est volontairement distinct de `maxTeamMembers` — ce dernier reste réservé à l'offre plateforme liée, voir la proposition "Séparer offres plateforme et offres d'évènement".)_

| Champ du formulaire `/admin/plans` (offre d'évènement) | Mode `PER_PARTICIPANT` (existant)                                         | Mode `FIXED_BUNDLE` (proposé)                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Prix (`priceAr`)                                       | Par participant                                                           | Forfait total, quel que soit le nombre invité jusqu'au plafond                        |
| Seuil minimum (`minParticipants`)                      | Visible — seuil plancher pour débloquer le paiement                       | Masqué — sans objet                                                                   |
| Nombre de sièges (`includedSeats`, nouveau)            | Sans objet                                                                | Obligatoire — c'est le nombre de sièges vendus pour cette édition                     |
| Calcul du montant dû (`/entreprise/paiement`)          | `priceAr × nombre de participants` (déclaré, voir proposition précédente) | `priceAr` fixe, peu importe le nombre exact invité (dans la limite d'`includedSeats`) |

```
[/admin/plans → Nouvelle offre]
  → Portée : Entreprise
  → Mode de tarification : ( ) Par participant   (•) Forfait fixe
        ↓ (si Forfait fixe sélectionné)
  → "Nombre de sièges inclus" (remplace le champ Seuil minimum)
  → "Prix du forfait" (remplace la mention "/ participant")
        ↓
[Offre créée avec pricingMode = FIXED_BUNDLE]
        ↓
[/entreprise/paiement pour une entreprise ayant choisi cette offre]
  → "Pack Direction — 10 sièges inclus" — Montant dû : 20 000 000 Ar (fixe)
  → Pas de blocage lié à un seuil de participants réels : le forfait peut
    être payé dès la création de l'entreprise, puis les sièges pourvus
    au rythme de l'entreprise (rejoint la proposition précédente,
    "payer avant de rassembler les collaborateurs" — mais ici sans même
    avoir besoin de déclarer un nombre, il est déjà fixé par l'offre)
```

**Décisions (résolues le 4 août 2026)** :

- **11ᵉ collaborateur sur un forfait de 10 sièges** : refus pur, message explicite ("Plafond de N sièges atteint pour cette offre"). Pas d'upsell/surcoût automatique — une entreprise qui veut plus de sièges change d'offre (changement libre avant validation déjà décidé ci-dessus) ou contacte CEO Summit pour un deal négocié (sponsoring, hors self-service).
- **Sponsoring (`isSelfService = false`)** : hors mécanisme — ces offres restent des montants négociés manuellement en back-office, `pricingMode` ne s'applique qu'aux offres self-service.
- **Conversion `PER_PARTICIPANT` → `FIXED_BUNDLE` après coup** : autorisée uniquement si aucune `CompanySubscription` n'y est encore rattachée (même garde-fou que la suppression d'offre déjà utilisée) — figé dès la première souscription réelle.
- **Application à `Plan.eventId` non nul** : `pricingMode` s'applique **exclusivement aux offres d'évènement** (voir tranchage dans la proposition "Séparer offres plateforme et offres d'évènement" ci-dessus) — sans objet pour une offre plateforme, qui n'a pas de tarif de vente direct par ce mécanisme.
- **`includedSeats`** (et non `maxTeamMembers`, réservé à l'offre plateforme — voir décision ci-dessus) est le nom du nouveau champ portant le nombre de sièges d'un forfait `FIXED_BUNDLE`.

---

### 🔄 Décision — Partager une offre en dehors de la plateforme — à implémenter

> **Statut : décidé le 4 août 2026, à implémenter.** Aujourd'hui, le lien profond `/inscription?offre=<slug>` fonctionne déjà (route publique, `middleware.ts`) mais trois manques rendent le partage peu pratique : (1) aucun bouton copier/QR code dans `/admin/plans` — le slug n'est qu'un champ texte, (2) la page publique n'affiche que le nom et le prix (`description`/`eligibilityNote` existent en base mais ne sont jamais lus, aucune image d'évènement jointe), (3) aucune balise Open Graph — un lien partagé sur WhatsApp/Facebook/LinkedIn n'a donc aucune preview.

**Décisions (résolues le 4 août 2026)** :

- **Lien copiable + QR code dans l'admin** : ajouter un bouton "Copier le lien" à la fois dans la liste (`/admin/plans`, action rapide par ligne, à côté de "Éditer"/"Activer"/"Supprimer") et dans le formulaire d'édition (où le QR code est aussi affiché, généré à la volée avec la librairie `qrcode` déjà utilisée pour les badges d'évènement — pas persisté en base). L'URL est construite avec `${process.env.NEXTAUTH_URL}/inscription?offre=${slug}`, exactement le même patron déjà utilisé pour les liens d'invitation collaborateur (`company-invites.ts:75`) — pas de nouvelle variable d'environnement à introduire.
- **Page publique enrichie** : la bannière de `/inscription?offre=` affiche désormais `plan.description` et `plan.eligibilityNote` (déjà retournés par `getPlanBySlug`, jamais lus par `signup-form.tsx` aujourd'hui), et si l'offre est liée à un évènement (`Plan.eventId`), l'image de l'évènement (`Event.imageUrl`, déjà en base) est affichée au-dessus du bandeau.
- **Preview réseaux sociaux (Open Graph)** : ajouter un `generateMetadata` (fonctionnalité standard Next.js App Router, pas encore utilisée ailleurs dans ce dépôt) sur la route `/inscription`, résolvant l'offre côté serveur pour renseigner `title` (nom de l'offre), `description` (`plan.description`) et `openGraph.images` (image de l'évènement lié, ou une image générique CEO Summit par défaut si aucun évènement lié — nouvelle image statique à ajouter dans `public/`).
- **Pas de pont API vers le site vitrine externe** — confirme la décision déjà actée ("Écart page publique évènement, résolu") : le lien profond reste le seul point d'intégration, le site vitrine externe continue d'être maintenu manuellement, indépendamment de cette base de données.

---

### Parcours C — Arrivée organique, sans lien profond ⚠️ _(fourche existante — à supprimer, voir décision section 0)_

**Existant (Phase 2ter), fourche individuel/entreprise :**

```
[/inscription — sans ?offre= (pas de bandeau d'offre)]
        ↓ S'inscrire → connexion automatique → /bienvenue (tutoriel)
        ↓
[/paiement-en-attente]
  → Fourche affichée :
    "À titre individuel" — grille d'offres individuelles cliquables
                 — ou —
    Bouton "Créer mon entreprise"
        ↓                                    ↓
[Clic sur une offre individuelle]     [Créer mon entreprise]
        ↓                                    ↓
[/adhesion/paiement]                 [/entreprise/creer — Étape 1 : choisir
  (suite = Parcours A, déprécié)         l'offre manuellement, pas de
                                          pré-sélection] → Étape 2 → ...
                                          (suite = Parcours B à partir
                                           de la création de la fiche)
```

**🔄 Cible :** supprimer la branche individuelle — `/paiement-en-attente` mène directement à `/entreprise/creer` (offre à choisir manuellement, pas de pré-sélection faute de lien profond), sans fourche à afficher.

**Vigilance UX (existant)** : si aucune offre individuelle self-service n'existe, la grille affiche _"Aucune offre individuelle disponible pour l'instant"_ — jamais une page cassée. _(Devient sans objet une fois la branche individuelle supprimée.)_

---

### Parcours D — Refus admin et re-soumission (individuel ou entreprise)

```
[Preuve soumise → /admin/adhesions ou /admin/entreprises]
        ↓
[Admin clique "✗ Refuser" → saisit un motif, ex. "Preuve illisible"]
        ↓
[Email/statut : refus + motif visible au candidat]
        ↓
[Statut repassé à "en attente de paiement" — /adhesion/paiement
 ou /entreprise/paiement redevient accessible pour re-soumission]
        ↓
[Nouvelle preuve uploadée → re-soumission]
        ↓
[Admin valide → accès activé]
```

---

## Annexe — Règles métier du module

> Règles marquées **(existant)** : vérifiées dans le code actuel. Marquées **(cible)** : décidées le 4 août 2026, pas encore développées.

| Règle                                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RG-01** _(existant)_                                         | Le catalogue d'offres et le clic initial "s'inscrire" vivent sur le site vitrine public, hors de ce dépôt — l'app ne fait que résoudre `/inscription?offre=<slug>`.                                                                                                                                                                                                                                                                 |
| **RG-02** _(existant)_                                         | Un `Plan.slug` inconnu dans un lien profond se comporte comme une inscription normale, sans bandeau ni erreur.                                                                                                                                                                                                                                                                                                                      |
| **RG-03** _(cible, remplace l'existant)_                       | Le prix d'une offre d'évènement dépend de son `pricingMode` : **par participant** (comportement historique, `priceAr × nombre déclaré`) ou **forfait fixe** (`priceAr` total pour `includedSeats` sièges) — voir UC-09. Une offre plateforme n'a pas de `pricingMode` (pas de vente directe par ce mécanisme).                                                                                                                      |
| **RG-04** _(cible, remplace l'existant)_                       | Pour une offre `PER_PARTICIPANT`, le montant dû est calculé automatiquement à partir du **nombre de participants déclaré par l'entreprise** (pas du headcount réel) — aucune saisie libre du montant. Pour une offre `FIXED_BUNDLE`, le montant est le forfait fixe, indépendant du nombre exact invité.                                                                                                                            |
| **RG-05** _(cible, remplace l'existant)_                       | Le nombre de collaborateurs **réellement invités/acceptés** n'est plus un verrou de paiement — c'est une donnée de suivi affichée à l'admin (indicateur "X/Y sièges utilisés"), pas une condition bloquante.                                                                                                                                                                                                                        |
| **RG-06** _(cible, remplace l'existant)_                       | Le nombre déclaré (participants prévus ou sièges du forfait) est **verrouillé dès l'upload d'une preuve de paiement** — le modifier exige d'attendre la décision de l'équipe CEO Summit (RG-11) : un refus repasse le dossier en `PENDING_PAYMENT`, seul état où l'offre (et donc le nombre déclaré) redevient modifiable.                                                                                                          |
| **RG-07** _(existant)_                                         | Une offre avec `isSelfService = false` (sponsoring négocié) est exclue de tout le parcours self-service (wizard entreprise, lien profond) mais reste visible/modifiable en back-office ; `pricingMode` ne s'applique pas à ces offres.                                                                                                                                                                                              |
| **RG-08** _(existant)_                                         | Un refus admin repasse le dossier en statut permettant une re-soumission de preuve, sans recréer le compte ni l'entreprise.                                                                                                                                                                                                                                                                                                         |
| **RG-09** _(cible, remplace l'existant)_                       | Les avantages plateforme (crédits Deal Room, quotas de collaborateurs) sont attribués **à l'entreprise** à la confirmation admin (`confirmCompanyPayment`), lus depuis l'offre plateforme liée (`Plan.linkedPlatformPlanId`) — plus reportés à une "Phase 3" indéterminée. Le pool de crédits est partagé au niveau entreprise ; sa répartition entre collaborateurs reste un mécanisme distinct, hors périmètre de ce module.      |
| **RG-10**                                                      | ⚠️ Retirée — sans objet une fois le scope individuel supprimé (plus de risque de cumul individuel/entreprise, voir section 0).                                                                                                                                                                                                                                                                                                      |
| **RG-11** _(révisée 6 août 2026)_                              | Un changement d'offre reste possible **tant que le statut est `PENDING_PAYMENT`** (avant soumission d'une preuve, ou après un refus admin qui y ramène le dossier). Une fois une preuve soumise (`PENDING_REVIEW`), l'offre est verrouillée jusqu'à la décision de l'équipe CEO Summit — plus de changement possible à ce stade, pour éviter toute confusion sur le montant réellement dû pendant la revue.                         |
| **RG-12** _(cible, nouvelle)_                                  | Une souscription à une offre d'évènement passe automatiquement de `ACTIVE` à `EXPIRED` une fois la date de l'évènement lié dépassée — traité comme "pas d'accès actif" pour cette édition, sans affecter les avantages plateforme déjà attribués (crédits, etc., qui persistent).                                                                                                                                                   |
| **RG-13** _(cible, nouvelle)_                                  | Une offre plateforme référencée par au moins une offre d'évènement (`linkedPlatformPlanId`) ne peut pas être supprimée (même garde-fou que pour une offre déjà utilisée par un `User`/`Membership`) — seule sa désactivation est possible, sans effet rétroactif sur les offres d'évènement déjà liées.                                                                                                                             |
| **RG-14** _(cible, nouvelle — corrige un écart déjà existant)_ | `acceptCompanyInvite` crée l'`EventRegistration` du nouveau collaborateur au moment de l'acceptation si l'abonnement entreprise est `ACTIVE` et lié à un évènement — pas seulement à la confirmation du paiement (`confirmCompanyPayment`). Sans cette règle, aucun collaborateur invité après paiement n'obtient de badge QR, ce qui rendrait la décision "payer avant de rassembler les collaborateurs" inutilisable en pratique. |

---

## Écart "page publique évènement" — résolu, sans action requise

Le parcours "l'utilisateur clique sur l'évènement CEO Summit et voit plusieurs offres" suppose une page publique listant les offres. **Décision : hors périmètre de ce dépôt.** Cette étape est portée par le site vitrine externe (workstream séparé, confirmé dans `BACKLOG_DEV.md`), qui reste la source de vérité pour la découverte/comparaison d'offres ; ce dépôt se limite au pont via lien profond (`/inscription?offre=<slug>`). Aucune page publique équivalente n'est à construire ici, sauf besoin de démo interne exprimé explicitement plus tard.

---

## Voir aussi

- [`01_onboarding_acces.md`](01_onboarding_acces.md) — onboarding par invitation/parrainage pour le cercle privé (parcours différent, non payant)
- [`../TEST_PARCOURS_UTILISATEUR.md`](../TEST_PARCOURS_UTILISATEUR.md) — fiche de test pas-à-pas (mêmes cas, formulée pour la recette QA plutôt que pour la narration produit)
- [`../BACKLOG_DEV.md`](../BACKLOG_DEV.md) — entrées E10 Phase 2ter/2quater pour l'historique d'implémentation détaillé
