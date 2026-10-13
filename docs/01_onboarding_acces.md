# Module 01 — Onboarding & Accès

> **Statut :** En rédaction  
> **Version :** 1.0  
> **Date :** Juin 2026  
> **Projet :** CEO Summit — Plateforme Digitale

---

## Table des matières

1. [Vue d'ensemble du module](#1-vue-densemble-du-module)
2. [Personas](#2-personas)
3. [Cas d'usage](#3-cas-dusage)
4. [Parcours utilisateurs](#4-parcours-utilisateurs)
5. [User stories par écran](#5-user-stories-par-écran)

---

## 1. Vue d'ensemble du module

Le module Onboarding & Accès est le **point d'entrée unique** de la plateforme CEO Summit. Il conditionne la première impression du membre et pose les bases de la relation entre l'utilisateur et le cercle.

### Rôle stratégique

Ce module n'est pas un simple formulaire d'inscription. Il est le gardien de la sélectivité du cercle. Chaque accès accordé est une décision consciente de CEO Summit — jamais une formalité automatique.

### Trois portes d'entrée

| Code | Porte d'entrée          | Description                                                        |
| ---- | ----------------------- | ------------------------------------------------------------------ |
| P1   | Participation au Summit | Tout participant validé au Summit reçoit une invitation nominative |
| P2   | Parrainage membre       | Un membre existant recommande un dirigeant. CEO Summit valide.     |
| P3   | Sélection directe       | CEO Summit invite directement une personnalité stratégique         |

### Acteurs du module

| Acteur               | Rôle                                                   |
| -------------------- | ------------------------------------------------------ |
| **Candidat**         | Dirigeant souhaitant rejoindre le cercle               |
| **Membre parrain**   | Membre existant qui recommande un candidat             |
| **Admin CEO Summit** | Valide ou refuse les demandes d'accès                  |
| **Système**          | Envoie les emails, génère les badges, gère les statuts |

---

## 2. Personas

### 👤 Persona A — Marie, la participante Summit

- **Profil :** Directrice Générale, 44 ans, secteur finance, Madagascar
- **Contexte :** A participé au dernier CEO Summit. Reçoit un email d'invitation à rejoindre le cercle digital 3 jours après l'événement.
- **Motivation :** Maintenir le contact avec les dirigeants rencontrés. Accéder aux contenus Intelligence.
- **Frein :** Manque de temps. Méfiance vis-à-vis des plateformes qui deviennent du spam.

### 👤 Persona B — Jean-Luc, le parrainé

- **Profil :** PDG d'un groupe industriel, 52 ans, Réunion
- **Contexte :** Un ami membre du cercle lui a parlé du CEO Summit et propose de le parrainer.
- **Motivation :** Accès au réseau de dirigeants régionaux. Opportunités de partenariat.
- **Frein :** Ne connaît pas encore la plateforme. Veut s'assurer de la qualité des membres.

### 👤 Persona C — Admin CEO Summit

- **Profil :** Membre de l'équipe CEO Summit chargé de la gestion des membres
- **Contexte :** Reçoit et traite les demandes d'accès. Valide les profils, modère les contenus.
- **Besoin :** Interface claire, rapide, avec toutes les infos pour décider en 2 minutes.

---

## 3. Cas d'usage

### UC-01 — Inscription via invitation Summit

**Description :** Un participant au Summit reçoit une invitation nominative et crée son compte sur la plateforme.

**Acteur principal :** Candidat (Persona A)  
**Déclencheur :** Réception d'un email d'invitation post-Summit  
**Préconditions :**

- Le candidat a participé au Summit et a été validé par CEO Summit
- Son email est dans la base de données exportée de l'événement

**Résultat attendu :** Le candidat a un compte créé, en attente de validation finale par l'admin.

---

### UC-02 — Inscription via parrainage

**Description :** Un membre existant soumet la candidature d'un dirigeant qu'il recommande. CEO Summit valide ou refuse.

**Acteur principal :** Membre parrain + Candidat (Persona B)  
**Déclencheur :** Le membre parrain initie une recommandation depuis son espace membre  
**Préconditions :**

- Le parrain est un membre actif et validé
- Le candidat n'est pas déjà membre

**Résultat attendu :** Le candidat est notifié, crée son profil, et attend la validation CEO Summit.

---

### UC-03 — Inscription via sélection directe

**Description :** L'équipe CEO Summit invite directement un dirigeant stratégique, sans passage par l'événement ni parrainage.

**Acteur principal :** Admin CEO Summit  
**Déclencheur :** Décision interne d'inviter un profil stratégique  
**Préconditions :**

- L'admin est connecté au back-office
- Le profil cible est identifié (email connu)

**Résultat attendu :** Le candidat reçoit une invitation VIP personnalisée et crée son compte.

---

### UC-04 — Validation d'une candidature (Admin)

**Description :** L'admin examine une demande d'accès et décide de valider, mettre en attente ou refuser.

**Acteur principal :** Admin CEO Summit (Persona C)  
**Déclencheur :** Nouvelle demande d'accès dans la file d'attente  
**Préconditions :**

- Une demande est soumise (via UC-01, UC-02 ou UC-03)
- L'admin est connecté au back-office

**Résultat attendu :** Le candidat est notifié de la décision. Si validé, son compte est activé.

---

### UC-05 — Premier accès et onboarding

**Description :** Un nouveau membre validé se connecte pour la première fois et découvre la plateforme via un parcours guidé.

**Acteur principal :** Nouveau membre  
**Déclencheur :** Réception de l'email de validation du compte  
**Préconditions :**

- Le compte est validé par l'admin
- Le membre a défini son mot de passe

**Résultat attendu :** Le membre a complété son profil, compris les fonctionnalités clés, et accède au cercle.

---

### UC-06 — Génération et utilisation du badge digital QR

**Description :** Un membre génère son badge digital QR pour accéder physiquement à un événement CEO Summit.

**Acteur principal :** Membre  
**Déclencheur :** Inscription à un événement + approche de la date  
**Préconditions :**

- Le membre est inscrit à l'événement
- Son paiement est confirmé

**Résultat attendu :** Le membre dispose d'un QR code unique, valide uniquement pour l'événement concerné.

---

### UC-07 — Connexion récurrente (Login)

**Description :** Un membre existant se reconnecte à la plateforme.

**Acteur principal :** Membre  
**Déclencheur :** Accès volontaire à la plateforme  
**Préconditions :**

- Le compte est actif
- Le membership est valide (non expiré)

**Résultat attendu :** Le membre accède à son espace en moins de 10 secondes.

---

## 4. Parcours utilisateurs

### Parcours P1 — Invitation post-Summit (UC-01)

```
[Email d'invitation reçu]
        ↓
[Clic sur le lien d'invitation]  ← Lien unique, expiré après 14 jours
        ↓
[Écran de bienvenue personnalisé]
"Bonjour Marie, vous êtes invitée à rejoindre le cercle CEO Summit"
        ↓
[Création du mot de passe]
        ↓
[Formulaire de complétion du profil]
  → Photo professionnelle
  → Titre & entreprise (pré-rempli depuis les données Summit)
  → Secteur d'activité
  → Pays
  → Bio courte (150 mots max)
  → LinkedIn (optionnel)
        ↓
[Récapitulatif de la demande + bouton "Soumettre mon profil"]
        ↓
[Écran de confirmation]
"Votre profil est en cours de validation.
 Vous recevrez une réponse sous 48h."
        ↓
[Email de confirmation de soumission]
        ↓
[Admin reçoit la notification → UC-04]
        ↓
    [Validé]                    [Refusé]
        ↓                           ↓
[Email de bienvenue]        [Email de refus poli]
        ↓
[UC-05 — Premier accès]
```

---

### Parcours P2 — Parrainage (UC-02)

```
[Membre connecté → "Recommander un dirigeant"]
        ↓
[Formulaire de recommandation]
  → Nom, prénom, email du candidat
  → Entreprise, titre
  → Secteur, pays
  → Message de recommandation personnalisé (obligatoire)
        ↓
[Confirmation : "Votre recommandation a été transmise"]
        ↓
[Candidat reçoit un email de parrainage]
"[Prénom Parrain] vous recommande de rejoindre le cercle CEO Summit"
        ↓
[Candidat clique → Écran de bienvenue parrainé]
"Vous avez été recommandé par [Parrain]. Voici ce que signifie intégrer le cercle."
        ↓
[Suite identique à P1 → Complétion profil → Soumission → Validation admin]
        ↓
[Si validé : Parrain reçoit une notification]
"Votre recommandation a été acceptée. [Candidat] rejoint le cercle."
```

---

### Parcours P3 — Sélection directe Admin (UC-03)

```
[Admin → Back-office → "Inviter un membre"]
        ↓
[Formulaire invitation directe]
  → Email, nom, prénom, titre, entreprise
  → Message d'invitation personnalisé (optionnel)
  → Niveau de membership proposé (Member / Executive / Chairman)
        ↓
[Système envoie un email VIP]
"CEO Summit vous invite personnellement à rejoindre le cercle."
        ↓
[Candidat suit le parcours P1 à partir de l'écran de bienvenue]
        ↓
[Compte activé directement au niveau proposé, sans re-validation admin]
  ← Exception : invitation directe = pré-validée
```

---

### Parcours P4 — Validation Admin (UC-04)

```
[Admin reçoit notification ou consulte la file d'attente]
        ↓
[Liste des candidatures en attente]
  → Filtres : Date, Source (Summit / Parrainage / Direct), Secteur, Pays
        ↓
[Fiche candidature]
  → Photo, nom, titre, entreprise, secteur, pays
  → Source de la candidature
  → Message du parrain (si parrainage)
  → Lien LinkedIn (si fourni)
  → Date de soumission
        ↓
[Décision admin]
    ┌─────────────────────────────────┐
    │  ✅ Valider     │  ⏸ Attente   │  ❌ Refuser  │
    └─────────────────────────────────┘
        ↓ Valider
[Choisir le niveau de membership]
  → Member / Executive Circle / Chairman Circle / Founding Member
        ↓
[Ajouter une note interne (optionnel)]
        ↓
[Confirmer → Email de bienvenue envoyé au candidat]
        ↓ Refuser
[Motif de refus (menu déroulant interne, non visible du candidat)]
  → Profil non aligné avec les critères
  → Secteur non prioritaire
  → Informations insuffisantes
  → Autre
        ↓
[Email de refus poli envoyé automatiquement]
```

---

### Parcours P5 — Premier accès et onboarding (UC-05)

```
[Clic sur le lien "Accéder au cercle" dans l'email de bienvenue]
        ↓
[Écran de bienvenue animé]
"Bienvenue dans le cercle CEO Summit, [Prénom]."
        ↓
[Tutoriel en 4 étapes (skippable)]
  1. "Votre profil" → Compléter les informations manquantes
  2. "Le cercle" → Découvrir les membres
  3. "Le Deal Room" → Parcourir les opportunités
  4. "CEO Summit Intelligence" → Lire le premier contenu
        ↓
[Suggestion : "Compléter votre profil pour être visible des autres membres"]
  → Barre de progression du profil (ex: 60% complété)
        ↓
[Accès au tableau de bord membre]
```

---

## 5. User stories par écran

---

### ÉCRAN 01 — Page d'invitation (lien email)

**Description :** Première page que voit le candidat en cliquant sur le lien dans l'email d'invitation.

#### US-001

> **En tant que** candidat invité via le Summit,  
> **Je veux** voir une page de bienvenue personnalisée avec mon prénom et le contexte de l'invitation,  
> **Afin de** comprendre immédiatement pourquoi je suis invité et ce qui m'attend.

**Critères d'acceptation :**

- [ ] La page affiche le prénom du candidat (récupéré depuis l'email)
- [ ] La page mentionne clairement la source de l'invitation (Summit / Parrainage / Sélection directe)
- [ ] Si parrainage : le nom et la photo du parrain sont affichés
- [ ] Un bouton "Rejoindre le cercle" est visible above the fold
- [ ] Si le lien a expiré (>14 jours) : message d'expiration + formulaire de contact

#### US-002

> **En tant que** candidat,  
> **Je veux** voir une description concise de ce qu'est le cercle CEO Summit,  
> **Afin de** décider en connaissance de cause si je souhaite poursuivre.

**Critères d'acceptation :**

- [ ] 3 à 4 lignes maximum décrivent le cercle (pas un pavé de texte)
- [ ] Les 3 piliers (Cercle / Deal Room / Intelligence) sont mentionnés visuellement
- [ ] Aucun formulaire n'est visible sur cette première page (étape de découverte, pas d'action forcée)

---

### ÉCRAN 02 — Création du mot de passe

**Description :** Écran sécurisé de définition du mot de passe, accessible une seule fois via le lien d'invitation.

#### US-003

> **En tant que** candidat,  
> **Je veux** créer un mot de passe sécurisé de manière simple,  
> **Afin de** protéger mon accès au cercle.

**Critères d'acceptation :**

- [ ] Champ mot de passe + confirmation
- [ ] Indicateur de robustesse en temps réel (faible / moyen / fort)
- [ ] Règles visibles : 8 caractères min, 1 majuscule, 1 chiffre, 1 caractère spécial
- [ ] Bouton "Voir le mot de passe" (œil)
- [ ] Soumission impossible si les deux champs ne correspondent pas

---

### ÉCRAN 03 — Formulaire de complétion du profil

**Description :** Formulaire en plusieurs étapes pour compléter les informations du profil membre.

#### US-004

> **En tant que** candidat,  
> **Je veux** compléter mon profil en plusieurs étapes courtes,  
> **Afin de** ne pas être découragé par un long formulaire et de donner les infos essentielles.

**Critères d'acceptation :**

- [ ] Le formulaire est divisé en 3 étapes maximum avec indicateur de progression
- [ ] Étape 1 : Photo professionnelle (upload) + Prénom / Nom + Titre + Entreprise
- [ ] Étape 2 : Secteur d'activité (liste déroulante) + Pays + Ville
- [ ] Étape 3 : Bio courte (textarea, max 150 mots, compteur visible) + LinkedIn (optionnel)
- [ ] Les données déjà connues (depuis le Summit) sont pré-remplies et modifiables
- [ ] Retour en arrière possible entre les étapes sans perte de données

#### US-005

> **En tant que** candidat,  
> **Je veux** uploader une photo professionnelle facilement,  
> **Afin de** soigner ma première impression auprès des autres membres.

**Critères d'acceptation :**

- [ ] Formats acceptés : JPG, PNG, WEBP
- [ ] Taille max : 5 Mo
- [ ] Prévisualisation avant validation
- [ ] Recadrage (crop) carré possible directement dans l'interface
- [ ] Si aucune photo : avatar par défaut avec initiales (pas d'icône générique)
- [ ] Message d'encouragement : "Une photo professionnelle augmente la confiance des autres membres"

#### US-006

> **En tant que** candidat,  
> **Je veux** pouvoir sauvegarder ma progression et reprendre plus tard,  
> **Afin de** ne pas perdre mes données si je suis interrompu.

**Critères d'acceptation :**

- [ ] Sauvegarde automatique à chaque changement d'étape
- [ ] Email de relance automatique si le profil n'est pas soumis dans les 48h
- [ ] Le lien de reprise dans l'email de relance est valide 7 jours supplémentaires

---

### ÉCRAN 04 — Récapitulatif et soumission

**Description :** Vue synthétique du profil avant soumission officielle pour validation.

#### US-007

> **En tant que** candidat,  
> **Je veux** voir un récapitulatif clair de mon profil avant de le soumettre,  
> **Afin de** vérifier et corriger mes informations avant qu'elles soient examinées par CEO Summit.

**Critères d'acceptation :**

- [ ] Affichage complet du profil tel qu'il apparaîtra aux membres
- [ ] Bouton "Modifier" accessible sur chaque section
- [ ] Bouton principal "Soumettre mon profil pour validation"
- [ ] Avertissement : "Une fois soumis, votre profil ne sera plus modifiable jusqu'à validation"
- [ ] Checkbox "Je confirme que les informations fournies sont exactes"

---

### ÉCRAN 05 — Confirmation de soumission

**Description :** Écran affiché immédiatement après la soumission du profil.

#### US-008

> **En tant que** candidat ayant soumis son profil,  
> **Je veux** recevoir une confirmation claire et rassurante,  
> **Afin de** savoir que ma demande a bien été prise en compte et connaître la suite.

**Critères d'acceptation :**

- [ ] Message de confirmation affiché à l'écran (pas seulement par email)
- [ ] Délai indicatif de réponse mentionné : "Vous recevrez une réponse sous 48h ouvrées"
- [ ] Email de confirmation envoyé dans les 2 minutes suivant la soumission
- [ ] L'écran ne propose pas encore d'accès à la plateforme (compte non encore validé)
- [ ] Contact de l'équipe CEO Summit disponible en cas de question

---

### ÉCRAN 06 — Email de bienvenue (post-validation)

**Description :** Email envoyé automatiquement par le système lors de la validation du compte par l'admin.

#### US-009

> **En tant que** candidat validé,  
> **Je veux** recevoir un email de bienvenue premium qui reflète la qualité du cercle,  
> **Afin de** vivre ma première interaction avec CEO Summit comme une expérience sélective et positive.

**Critères d'acceptation :**

- [ ] Email signé par le CEO ou la direction de CEO Summit (pas un email générique)
- [ ] Mention du niveau de membership attribué (Member / Executive / Chairman)
- [ ] Bouton "Accéder au cercle" lié à l'URL de la plateforme
- [ ] Ton chaleureux mais institutionnel — pas marketing
- [ ] Compatible mobile (responsive email)
- [ ] Pas de pièces jointes ni d'images trop lourdes

---

### ÉCRAN 07 — Onboarding guidé (premier accès)

**Description :** Tutoriel en étapes affiché lors du tout premier accès à la plateforme après validation.

#### US-010

> **En tant que** nouveau membre validé,  
> **Je veux** être guidé lors de mon premier accès avec un tutoriel court et skippable,  
> **Afin de** comprendre rapidement ce que je peux faire sur la plateforme sans me sentir submergé.

**Critères d'acceptation :**

- [ ] Tutoriel en 4 étapes maximum (pas plus)
- [ ] Chaque étape = 1 écran avec 1 illustration + 1 titre + 2 lignes max de texte
- [ ] Bouton "Passer" visible à chaque étape
- [ ] Bouton "Terminer" sur la dernière étape
- [ ] Le tutoriel ne se re-déclenche pas aux connexions suivantes
- [ ] Accessible à nouveau via les paramètres du profil

#### US-011

> **En tant que** nouveau membre,  
> **Je veux** voir une barre de progression de mon profil dès mon premier accès,  
> **Afin de** savoir quelles informations compléter pour être pleinement visible dans le cercle.

**Critères d'acceptation :**

- [ ] Barre de progression affichée sur le tableau de bord (ex: "Profil complété à 65%")
- [ ] Liste des actions manquantes cliquables (photo, bio, secteur, etc.)
- [ ] La barre disparaît une fois le profil à 100% (ne pas l'afficher à vie)
- [ ] Aucune fonctionnalité n'est bloquée par le taux de complétion

---

### ÉCRAN 08 — Formulaire de recommandation (parrain)

**Description :** Interface permettant à un membre de recommander un candidat au cercle.

#### US-012

> **En tant que** membre existant,  
> **Je veux** recommander facilement un dirigeant de confiance,  
> **Afin de** enrichir le cercle avec des profils de qualité que je connais personnellement.

**Critères d'acceptation :**

- [ ] Formulaire accessible depuis le menu principal (ex: "Recommander un membre")
- [ ] Champs : email, prénom, nom, titre, entreprise, pays, secteur
- [ ] Champ texte libre obligatoire : "Pourquoi recommandez-vous cette personne ?" (100 mots min)
- [ ] Avertissement visible : "Votre recommandation engage votre réputation au sein du cercle"
- [ ] Confirmation avant envoi : récapitulatif + bouton "Confirmer ma recommandation"
- [ ] Un membre peut recommander maximum 3 candidats par année civile

#### US-013

> **En tant que** membre parrain,  
> **Je veux** suivre le statut de ma recommandation,  
> **Afin de** savoir si mon candidat a rejoint le cercle.

**Critères d'acceptation :**

- [ ] Section "Mes recommandations" dans le profil avec statuts : En attente / Validé / Refusé
- [ ] Notification push/email lorsqu'une décision est prise sur ma recommandation
- [ ] Si validé : message "Votre recommandation a été acceptée — [Candidat] rejoint le cercle"
- [ ] Le motif de refus n'est pas communiqué au parrain (discrétion)

---

### ÉCRAN 09 — Dashboard admin — File d'attente des candidatures

**Description :** Interface back-office permettant à l'admin de gérer les demandes d'accès entrantes.

#### US-014

> **En tant qu'** admin CEO Summit,  
> **Je veux** voir d'un coup d'œil toutes les candidatures en attente avec les informations essentielles,  
> **Afin de** traiter chaque demande rapidement et avec les bonnes informations.

**Critères d'acceptation :**

- [ ] Liste des candidatures avec : photo, nom, titre, entreprise, pays, source, date de soumission
- [ ] Filtres : source (Summit / Parrainage / Direct), secteur, pays, date
- [ ] Tri par date (plus ancienne en premier par défaut)
- [ ] Compteur de candidatures en attente visible en permanence
- [ ] Clic sur une candidature ouvre la fiche complète

#### US-015

> **En tant qu'** admin CEO Summit,  
> **Je veux** valider, mettre en attente ou refuser une candidature depuis la fiche,  
> **Afin de** gérer le processus de validation sans quitter l'interface.

**Critères d'acceptation :**

- [ ] 3 boutons d'action : ✅ Valider / ⏸ Mettre en attente / ❌ Refuser
- [ ] Si Valider : sélection obligatoire du niveau de membership + champ note interne (optionnel)
- [ ] Si Refuser : sélection obligatoire d'un motif interne (liste fermée)
- [ ] Confirmation demandée avant toute décision (modale "Êtes-vous sûr ?")
- [ ] Action irréversible depuis la fiche (modification possible uniquement depuis la liste membres)
- [ ] Email automatique envoyé au candidat dans les 5 minutes suivant la décision

---

### ÉCRAN 10 — Badge digital QR

**Description :** Génération et affichage du badge QR personnel pour l'accès aux événements physiques.

#### US-016

> **En tant que** membre inscrit à un événement CEO Summit,  
> **Je veux** accéder à mon badge digital QR depuis l'application mobile,  
> **Afin de** m'identifier rapidement à l'entrée sans avoir à chercher un billet papier.

**Critères d'acceptation :**

- [ ] Badge accessible depuis l'app mobile → section "Mon badge"
- [ ] QR code unique par événement (pas un QR code générique membre)
- [ ] Le badge affiche : photo, nom complet, titre, entreprise, niveau membership
- [ ] Le QR code peut être scanné même sans connexion internet (fonctionnement offline)
- [ ] Si l'inscription n'est pas confirmée (paiement en attente) : badge non disponible
- [ ] Le badge est valide uniquement le(s) jour(s) de l'événement

#### US-017

> **En tant que** membre,  
> **Je veux** pouvoir sauvegarder mon badge dans mon wallet mobile (Apple Wallet / Google Wallet),  
> **Afin de** l'avoir toujours accessible même si l'app est fermée.

**Critères d'acceptation :**

- [ ] Bouton "Ajouter à Apple Wallet" / "Ajouter à Google Wallet" visible sur l'écran badge
- [ ] Le pass wallet se met à jour automatiquement si le statut d'inscription change
- [ ] Notification push envoyée 24h avant l'événement avec lien vers le badge

---

### ÉCRAN 11 — Écran de connexion (Login)

**Description :** Page de connexion récurrente pour les membres existants.

#### US-018

> **En tant que** membre existant,  
> **Je veux** me connecter rapidement à la plateforme,  
> **Afin d'** accéder au cercle sans friction.

**Critères d'acceptation :**

- [ ] Connexion par email + mot de passe
- [ ] Option "Se souvenir de moi" (session persistante 30 jours)
- [ ] Lien "Mot de passe oublié" visible (sans être proéminent)
- [ ] Connexion possible via Google SSO (optionnel, Phase 2)
- [ ] Délai de réponse serveur < 1 seconde
- [ ] 5 tentatives échouées → blocage temporaire 15 minutes + email d'alerte sécurité

#### US-019

> **En tant que** membre dont le membership a expiré,  
> **Je veux** voir un message clair m'expliquant la situation,  
> **Afin de** comprendre pourquoi je n'ai plus accès et comment renouveler.

**Critères d'acceptation :**

- [ ] Message d'expiration affiché à la connexion (pas une erreur générique)
- [ ] Le message mentionne la date d'expiration et le niveau concerné
- [ ] Bouton "Renouveler mon membership" avec lien vers la page de paiement
- [ ] L'accès aux contenus Intelligence publics reste disponible (site public)
- [ ] L'accès au cercle privé est suspendu jusqu'au renouvellement

---

## Annexe — Règles métier du module

| Règle     | Description                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RG-01** | Un lien d'invitation est valide 14 jours. Passé ce délai, il expire et une nouvelle invitation doit être générée.                                                                                                                                                                    |
| **RG-02** | Un membre peut recommander au maximum 3 candidats par année civile.                                                                                                                                                                                                                  |
| **RG-03** | L'invitation directe admin pré-valide le compte sans passage en file d'attente.                                                                                                                                                                                                      |
| **RG-04** | Un compte non soumis après 48h reçoit un email de relance automatique.                                                                                                                                                                                                               |
| **RG-05** | 5 tentatives de connexion échouées consécutives déclenchent un blocage temporaire de 15 minutes.                                                                                                                                                                                     |
| **RG-06** | Le badge QR est unique par événement et invalide en dehors des dates de l'événement.                                                                                                                                                                                                 |
| **RG-07** | Le motif de refus d'une candidature est confidentiel (non communiqué au candidat ni au parrain).                                                                                                                                                                                     |
| **RG-08** | Un compte dont le membership a expiré perd l'accès au cercle mais conserve son historique.                                                                                                                                                                                           |
| **RG-09** | Seuls les niveaux Executive Circle et Chairman Circle peuvent accéder aux fiches complètes du Deal Room et contacter les auteurs d'opportunités. Les membres basiques voient uniquement le titre et un extrait anonymisé.                                                            |
| **RG-10** | La mise en relation via le Deal Room est déclenchée automatiquement selon le mode de contact choisi par l'auteur (contact direct / messagerie plateforme / sur demande). CEO Summit ne valide pas chaque introduction — il supervise et intervient uniquement en cas de signalement. |

---

## Prochains modules

- `02_profil_membre.md` — Gestion du profil, niveaux de membership, visibilité
- `03_cercle_prive_directory.md` — Annuaire des membres, recherche, filtres
- `04_messagerie.md` — Messagerie privée, fil de conversation, notifications
- `05_deal_room.md` — Dépôt d'opportunités, expression d'intérêt, introductions
- `06_intelligence.md` — CMS éditorial, accès contenus, rapports premium
- `07_admin_dashboard.md` — Back-office complet, statistiques, modération
- `08_application_mobile.md` — App mobile, badge QR, notifications push
