# Module 03 — Cartographie des fonctionnalités existantes (par cas d'usage)

> **Statut :** État des lieux — vérifié directement sur le code (routes, actions serveur, schéma Prisma) au 7 août 2026, pas uniquement sur la documentation
> **Version :** 1.0
> **Date :** Août 2026
> **Projet :** CEO Summit — Plateforme Digitale

---

## Table des matières

1. [Parcours prospect (avant tout compte)](#1-parcours-prospect-avant-tout-compte)
2. [Authentification & compte](#2-authentification--compte)
3. [Espace membre](#3-espace-membre)
4. [Espace entreprise (B2B)](#4-espace-entreprise-b2b)
5. [Back-office administrateur](#5-back-office-administrateur)
6. [Notifications automatiques](#6-notifications-automatiques)
7. [Paiement — état actuel](#7-paiement--état-actuel)
8. [Sécurité & conformité](#8-sécurité--conformité)
9. [Infrastructure technique](#9-infrastructure-technique)
10. [Ce qui n'existe PAS encore (limites connues)](#10-ce-qui-nexiste-pas-encore-limites-connues)

---

## 1. Parcours prospect (avant tout compte)

- **Candidature** (`/demande-acces`) — formulaire de demande d'accès, consentement RGPD horodaté.
- **Back-office candidatures** (`/admin/candidatures`) — liste, détail, décision (approuver/refuser) par un admin.
- **Activation de compte** (`/activer/[token]`) — lien d'activation à durée de vie limitée (token expiré → renvoi possible, déjà utilisé → redirection login).
- **Inscription entreprise directe** (`/inscription`, `/entreprise/creer`) — une entreprise peut créer son compte, choisir une offre et inviter ses collaborateurs sans passer par une candidature validée par un admin (parcours B2B self-service).

## 2. Authentification & compte

- Connexion (`/login`), mot de passe oublié + réinitialisation par lien (`/mot-de-passe-oublie`, `/reinitialiser/[token]`).
- Onboarding nouveau membre (`/bienvenue`) — tutoriel en 4 étapes, sauvegardé au fur et à mesure.
- Édition de profil (`/profil/editer`) — infos, photo (upload Cloudflare R2), téléphone (nécessaire pour les SMS Befiana).
- RBAC middleware — mur grossier entre zones membre/admin, vérifications fines de tier faites page par page.

## 3. Espace membre

### Profil & réseau

- Catalogue des membres (`/catalogue`) — filtres, tri, pagination, fiche détail (`/catalogue/[id]`).
- Profil entreprise public (`/entreprises/[id]`).
- Dashboard membre (`/dashboard`) — crédits disponibles, connexions Deal Room, événements inscrits, messages non lus, aperçu opportunités/événements à venir.

### Événements

- Liste (`/evenements`) et détail (`/evenements/[id]`).
- Inscription + paiement (`/evenements/[id]/inscrire`) — virement, mobile money ou gratuit si inclus dans l'offre ; verrou Redis anti-survente sur la capacité.
- Badge QR digital consultable en ligne (`/evenements/[id]/badge`) et **téléchargeable en PDF au format A6** (`/evenements/[id]/badge/pdf`, avec photo de profil si renseignée).
- Tarification multi-niveaux par événement (offres propres à l'événement, éventuellement rattachées à une offre plateforme ou totalement indépendantes).
- Annulation d'inscription côté membre.
- Agenda multi-salles par événement, affiché en grille par jour (plusieurs sessions simultanées dans des salles différentes).

### Salles thématiques (temps réel)

- Liste des salles (`/salles`) avec badge non-lu et présence en ligne.
- Chat en temps réel (`/salles/[id]`) — frappe en cours, upload pièce jointe, signalement de message. Fonctionne via un **serveur Socket.io séparé** (`npm run socket:dev`, port 3001) — doit tourner en plus du serveur Next.js.

### Deal Room (mise en relation d'affaires)

- Liste des opportunités (`/deal-room`) avec visibilité par tier (Member/Executive/Chairman).
- Publication d'une opportunité (`/deal-room/publier`) — gratuite, passe par modération admin avant publication.
- Réédition d'une opportunité refusée/à modifier (`/deal-room/[id]/modifier`).
- Détail d'une opportunité (`/deal-room/[id]`), prise de contact avec déduction de crédit (**coût configurable par l'admin**, 0 = gratuit), retour automatique du crédit si la demande est refusée ou retirée sans réponse.
- Accepter/refuser une demande de contact reçue ; acceptation → création automatique d'une conversation privée.

### Messagerie privée

- Liste des conversations (`/messagerie`), thread temps réel (`/messagerie/[id]`) — même serveur Socket.io que les salles.
- Chiffrement au repos réel (pgcrypto), déchiffrement uniquement côté serveur.
- Notification email si le destinataire est hors-ligne depuis plus de 60s (anti-spam 1h).
- Lien direct Deal Room → conversation à l'acceptation d'un contact.

### Crédits Deal Room

- Achat de packs de crédits (`/credits/acheter`) — réservé Executive+, validation manuelle admin (ou webhook générique, voir §7).

### Catalogue de services

- Liste/fiche (`/catalogue/services`, `/catalogue/services/[id]`), dépôt d'une fiche (`/catalogue/services/publier`) — modération admin avant publication, filtrable par catégorie/pays/tier du prestataire.

## 4. Espace entreprise (B2B)

- Création d'entreprise (`/entreprise/creer`) et choix d'offre (`/entreprise` → sélection de plan).
- Paiement de l'abonnement entreprise (`/entreprise/paiement`) — upload de preuve (virement/mobile money), validation manuelle admin **ou** confirmation automatique via le webhook générique (voir §7). **Une fois le paiement soumis, les autres offres sont masquées** (le client ne peut plus changer d'offre à ce stade).
- Invitation de collaborateurs (`inviteTeammate`) — les collaborateurs invités sont automatiquement inscrits à la plateforme et reçoivent un email avec lien de connexion (création de mot de passe) ; si l'abonnement de l'entreprise est déjà actif et lié à un événement, ils sont aussi auto-inscrits à cet événement (avec envoi du badge/QR par email), sous réserve de capacité restante.
- Révocation d'une invitation en attente.
- Réassignation de l'admin entreprise (back-office, si le créateur initial ne doit plus l'être).
- Pool de crédits entreprise — les avantages (crédits Deal Room) viennent de l'offre plateforme liée à l'offre événement souscrite, répartis à chaque collaborateur actif au moment de la confirmation du paiement.

## 5. Back-office administrateur

### Auth & accès

- Auth admin séparée + RBAC granulaire par rôle (SUPER_ADMIN, FINANCIER, MODERATEUR...), chaque section du back-office vérifie le rôle requis.
- Gestion des comptes admin (promotion, changement de rôle, activation/désactivation) — `/admin/parametres` → onglet Administrateurs.

### Membres & entreprises

- Candidatures (`/admin/candidatures`) — approuver/refuser.
- Membres (`/admin/membres`) — suspendre/exclure/réactiver, attribuer des crédits manuellement, note interne.
- Entreprises (`/admin/entreprises`) — liste, détail, validation/refus de paiement, réassignation d'admin.

### Événements

- CRUD complet (`/admin/evenements`), création (`/admin/evenements/nouveau`), édition, changement de statut.
- Liste des inscrits (`/admin/evenements/[id]/inscrits`) — export CSV comptable, lien vers le check-in.
- Validation manuelle des paiements par virement/mobile money en attente (`/admin/finances`).
- **Check-in par scan QR caméra** (`/admin/evenements/[id]/checkin`) — décodage 100% client (`jsqr`), aucun flux vidéo envoyé au serveur ; repli en saisie manuelle.
- **Contrôle d'accès multi-postes** — plusieurs points de scan nommés par événement (ex. "Entrée VIP", "Entrée Staff"), compteurs par poste mis à jour en temps réel (Socket.io) sur tout tableau de bord ouvert.
- Agenda multi-salles (`/admin/evenements/[id]/agenda`) — CRUD des sessions (titre, horaire, salle, intervenants).

### Deal Room & crédits

- Modération des opportunités (`/admin/deal-room`) — approuver/refuser/demander des modifications.
- Validation des achats de crédits (`/admin/credits`).
- Réglage du coût du contact Deal Room (`/admin/parametres` → Tarifs & Règles) — configurable, 0 = gratuit pour tous.

### Salles & communications

- CRUD salles thématiques (`/admin/salles`), modération (suppression/avertissement/exclusion/archivage de message).
- Communications & broadcasts (`/admin/communications`) — envoi de campagnes email, taux d'ouverture suivi via webhook Resend.

### Finances

- Tableau de bord (`/admin/finances`) — MRR/ARR, revenus réels par source/tier, abonnements expirants avec relance manuelle, validation des paiements événement en attente, export CSV comptable.

### Offres & tarifs

- CRUD des offres/plans (`/admin/plans`) — catalogue d'offres librement créables (prix, crédits inclus, rang d'accès), plus limité aux 3 tiers fixes d'origine.
- Tarifs des packs de crédits Deal Room (`/admin/parametres` → Tarifs & Règles).
- Référentiels éditables (secteurs, pays, types d'opportunité) — `/admin/parametres` → Référentiels.

### Intégrations

- État de configuration en lecture seule des services externes (webhook paiement générique, Resend, Cloudflare R2, Zoom) — `/admin/parametres` → Intégrations.

## 6. Notifications automatiques

- **Email** (Resend + templates React Email) : activation, mot de passe oublié, confirmation de paiement (entreprise/événement/crédits), badge/QR à l'inscription (individuelle et collaborateur auto-inscrit), rejet de paiement, rappel de paiement en attente, alerte admin (nouvelle candidature, paiement à valider, opportunité/service à modérer, message signalé), notification de message hors-ligne, campagnes broadcast avec suivi d'ouverture.
- **SMS** (Befiana, `lib/sms.ts`) — notification simple post-paiement entreprise au payeur, si un téléphone est renseigné. Pas de vérification OTP.

## 7. Paiement — état actuel

- Tous les paiements (entreprise, événement, crédits) passent aujourd'hui par un règlement **hors plateforme** (virement, mobile money) avec **upload de preuve** puis **validation manuelle admin**.
- **Webhook de confirmation générique** déjà en place (`/api/webhooks/payments`) — permet à un prestataire externe de confirmer automatiquement un paiement (signature HMAC vérifiée), en plus de la validation manuelle qui reste toujours disponible. **Aucun prestataire n'est branché à ce jour** — il ne manque que l'intégration réelle (voir le document de demande d'information envoyé à Evolia).
- Aucune passerelle de paiement carte bancaire/Orange Money intégrée nativement à ce stade — le paiement en ligne temps réel n'existe pas encore, seulement la confirmation.

## 8. Sécurité & conformité

- Headers HTTP de sécurité, pages d'erreur brandées, pièces jointes R2 en URLs signées à durée limitée.
- Rate limiting / anti-brute-force sur login, inscription, mot de passe oublié.
- Validation Zod sur les actions exposées.
- Verrous Redis (avec repli no-op si Redis indisponible) contre les races : survente événement, double dépense de crédit, double confirmation de paiement.
- Consentement RGPD horodaté sur la demande d'accès. **Reste manquant** : droit à l'effacement (relations Prisma en `Restrict`), pages légales définitives, rétention illimitée des logs webhook/tokens, opt-out sur les broadcasts.
- Accessibilité : contrastes critiques et majeurs corrigés, lien d'évitement, `aria-live` sur le chat ; contrastes secondaires (`text-muted-foreground` sur fond blanc) encore à corriger.

## 9. Infrastructure technique

- PWA installable (service worker réel, cache offline-first, bandeau d'installation Android/iOS).
- Bottom nav mobile, revue responsive faite (non vérifiée sur appareil physique réel).
- Serveur Socket.io autonome (process séparé du serveur Next.js) pour tout le temps réel : salles, messagerie, indicateurs de présence/frappe, check-in multi-postes.
- Stockage fichiers Cloudflare R2 (avatars, documents, pièces jointes événement).
- CI/CD GitHub Actions (lint/type-check/tests/build + déploiement VPS automatique sur push `main`).
- Suite de tests Vitest (534 tests) couvrant actions, requêtes, webhooks, serveur temps réel.

## 10. Ce qui n'existe PAS encore (limites connues)

- Paiement en ligne temps réel (carte bancaire, Orange Money) — aujourd'hui uniquement confirmation a posteriori.
- Vérification SMS par OTP (le SMS Befiana n'est qu'une notification, pas une validation à deux facteurs).
- Facture/bon de commande générée automatiquement pour les inscriptions sponsorisées par une entreprise.
- Statistiques admin avancées au-delà des finances (pas de tableau de bord data/analytics dédié).
- Nettoyage définitif de l'ancien enum `Tier` (legacy, coexiste avec le système d'offres `Plan`).
- Check-in "par session" (l'agenda multi-salles existe, mais pas d'inscription/capacité par session — uniquement au niveau de l'événement entier).
- API mobile — aucune n'existe, uniquement la PWA.
- Push notifications natives (infra VAPID absente).

---

_Document préparé à partir de l'état réel du code (routes, actions, schéma Prisma) — pas uniquement de la documentation, qui peut dériver (voir le cas du webhook Evolia trouvé obsolète le 7 août 2026, documenté dans BACKLOG_DEV.md)._
