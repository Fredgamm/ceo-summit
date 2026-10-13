# Module 17 — Audit de nettoyage module par module

> **Statut :** audit terminé le 1er octobre ; phase P0 (bugs et sécurité) corrigée le 2 octobre et fusionnée dans `mvp-connect-simple`. Phase P2 (code mort) faite en local le 7 octobre sur la branche `cleanup/p2-code-mort` (5 commits), selon la recommandation du §3 : code supprimé, schéma conservé. Type-check, lint, 716 tests et build verts. **P2 n'est ni poussée ni déployée.** Phases P1, P3, P4 et P5 en attente.
> **Version :** 1.0
> **Date :** 2 octobre 2026
> **Périmètre :** dépôt `app/`, branche de production `mvp-connect-simple` (app.ceo-summit.mg)
> **Méthode :** 6 audits en lecture seule menés en parallèle :
>
> - authentification et onboarding ;
> - entreprise, offres et paiement ;
> - Deal Room, services et annuaire ;
> - événements, salles et messagerie ;
> - back-office et communications ;
> - architecture et hygiène du dépôt.
>
> Chaque constat est appuyé par une recherche dans le code (fichier et ligne).

---

## 0. Vue d'ensemble

**Verdict : le nettoyage complet est faisable, sans reconstruction.**

**Le socle est sain au départ.** Avant la phase P0, on comptait :

- 79 fichiers et 773 tests, tous verts ;
- un contrôle de types et un lint sans erreur ;
- une CI qui bloque le déploiement en cas d'échec ;
- 35 migrations qui s'appliquent proprement sur une base vide.

**Le vrai problème est l'accumulation.** La règle de septembre était « on garde le schéma et le code, on débranche seulement le chemin actif » (`BACKLOG_MVP.md` §0). Résultat :

- quatre fonctionnalités retirées du MVP sont toujours dans le code : crédits Deal Room, check-in/QR, paliers Member/Executive/Chairman et parcours candidature ;
- elles réapparaissent à l'écran à plusieurs endroits ;
- le code est rangé par couche technique (`app/actions`, `lib`, `components`), pas par module.

| Phase  | Contenu                                                                  | Effort        | Statut                                                |
| ------ | ------------------------------------------------------------------------ | ------------- | ----------------------------------------------------- |
| **P0** | Bugs et failles bloquants avant tout déploiement                         | 3 j           | ✅ Corrigé en local, sauf CGU (§1.2)                  |
| **P1** | Correctifs non fusionnés des autres branches, ménage git et dépôt parent | 2 j           | En attente                                            |
| **P2** | Retrait du code mort (crédits, QR, paliers, candidature)                 | 3–4 j         | ✅ Fait en local le 7 octobre (§3.4), schéma conservé |
| **P3** | Restructuration par modules                                              | 5–7 j         | En attente                                            |
| **P4** | Tests manquants (middleware, accès, intégration Postgres)                | 3 j           | En attente                                            |
| **P5** | Nettoyage des commentaires et réécriture du README pour le MVP           | 2 j + continu | En attente                                            |

---

## 1. P0 — Corrigé en local (2 octobre)

Chaque correctif fait l'objet d'un commit dédié, avec ses tests.

| #   | Problème                                                                                                                                                                                | Commit    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Pièces jointes de broadcast inutilisables en prod : lien relatif dans l'email, accès refusé (403) aux membres. Ce bug venait du correctif `4449a03` du module 16, encore jamais poussé. | `6bc047b` |
| 2   | Un admin désactivé ou suspendu gardait l'accès aux pages `/admin` jusqu'à 24 h                                                                                                          | `7539bde` |
| 3   | Le seed (comptes `ChangeMe123!` / `Demo1234!`) était exécutable en production, et DEPLOY.md §7 le conseillait                                                                           | `291c1e5` |
| 4   | La CI redéployait aussi sur un push vers `main`, qui a 102 commits de retard                                                                                                            | `6ee0b27` |
| 5   | Impossible de se réinscrire après une annulation ; « Inscrit ✓ » faux au-delà de 12 inscrits ou après une annulation                                                                    | `b03335c` |
| 6   | Un compte non payé ouvrait n'importe quelle fiche `/entreprises/[id]`                                                                                                                   | `31a88d9` |
| 7   | N'importe quel collaborateur, ou une entreprise non payée, pouvait publier un service                                                                                                   | `844d084` |
| 8   | `/messagerie?opportunity=<id>` rattachait n'importe quelle opportunité ; destinataire inconnu ou suspendu non contrôlé                                                                  | `40e06dc` |
| 9   | Contenu des messages de salle modérés encore lisible dans les réponses envoyées au navigateur                                                                                           | `f2969b9` |
| 10  | La sidebar affichait « Chairman » pour toute offre classée en 3e position ou au-delà                                                                                                    | `b703c51` |
| 11  | MRR faux (un supplément remplaçait le prix de l'offre, les abonnements EXPIRED étaient comptés) ; export comptable incluant les paiements REJECTED                                      | `ca99458` |
| 12  | Temps réel coupé après 5 minutes : jeton expiré à la reconnexion, salle ou conversation non rejointe                                                                                    | `4c96f7b` |
| 13  | Upload d'avatar bloqué avant la validation du paiement                                                                                                                                  | `5ddd173` |
| 14  | Confirmation de paiement non atomique : paiement confirmé mais abonnement non activé                                                                                                    | `2caf35a` |
| 15  | Carte et Mobile Money acceptés par le serveur sur appel direct                                                                                                                          | `407f565` |
| 16  | Double envoi de l'inscription : erreur 500                                                                                                                                              | `f2ecdc6` |
| 17  | Un modérateur pouvait suspendre un super-admin ; le dernier super-admin pouvait être rétrogradé                                                                                         | `15668e8` |
| 18  | Suppression d'une valeur de référentiel encore utilisée (repris de `refactor/dette-technique`)                                                                                          | `1acdad6` |
| 19  | Broadcast affiché « envoyé » même quand les envois échouaient                                                                                                                           | `580638e` |
| 20  | Aucune limite de débit sur les 8 routes d'upload (repris de `refactor/dette-technique`)                                                                                                 | `784b776` |

### 1.1 À vérifier côté production avant de pousser

- **Compte de démo** : si le seed a déjà tourné sur app.ceo-summit.mg, le compte `admin@ceo-summit.mg` / `ChangeMe123!` existe. Changer ce mot de passe immédiatement.
- **Navigateur** : vérifier dans un vrai navigateur les parcours touchés : inscription à un événement, ré-inscription, salle après une veille de plus de 5 minutes, broadcast avec pièce jointe, finances.
- **Déploiement** : le push de `mvp-connect-simple` déclenche le déploiement. Il embarquera à la fois les 8 commits du module 16 et ceux de P0.

### 1.2 P0 restant — nécessite une décision du client

**Consentement CGU et confidentialité absent de l'inscription.**

- **Constat** : `/cgu` et `/confidentialite` ne sont liées que depuis le formulaire de candidature, qui n'est plus atteignable. Leur texte décrit l'ancien modèle (« réservé aux candidats approuvés », « niveau de membership »).
- **Correctif technique** : une case à cocher dans l'assistant d'inscription et un horodatage du consentement. C'est simple.
- **Préalable** : le texte juridique doit d'abord être fourni ou validé par le client. Point sensible pour la Loi 25 et le RGPD.

---

## 2. Conformité des écrans au MVP (constat du 1er octobre)

| Statut           | Écrans                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Conformes     | `/login`, `/invitation/[token]`, mot de passe oublié et réinitialisation, `/entreprise/creer`, `/deal-room/publier`, `/messagerie`, `/catalogue/services/[id]`, `/admin/catalogue-services`                          |
| 🟡 Partiels      | `/inscription`, `/entreprise/paiement`, `/entreprises/[id]`, `/deal-room`, `/evenements`, `/evenements/[id]/badge`, `/salles`, `/dashboard`, `/admin`, `/admin/communications`, `/admin/plans`, `/admin/entreprises` |
| ❌ Non conformes | `/catalogue` (filtre et tri par palier), `/admin/membres` (colonnes Tier et Crédits), `/admin/candidatures`, `/demande-acces`, `/cgu`, `/confidentialite`                                                            |
| ⚫ Morts         | `/activer/[token]`, `/demande-acces`, `/credits/*`, `/admin/credits`, `/admin/evenements/[id]/checkin`, `/catalogue/[id]`                                                                                            |

Les écrans partiels le sont pour ces raisons :

- **Paliers résiduels** : badges et filtres Executive/Chairman.
- **Libellés trompeurs** : « badge digital », « Inclus membership », « Inscription confirmée » alors que le paiement est en attente, « s'active automatiquement » alors qu'il faut se reconnecter.
- **Prix** : prix en Ariary seul à certains endroits (contraire au §1.3 du module 16).

À part : la liste `/catalogue/services` existe, mais aucun menu n'y mène.

### 2.1 Anomalies non bloquantes relevées (à traiter en P2–P3)

- **Accès figé** : `hasCompanyAccess` est stocké dans le JWT jusqu'à 24 h. Après validation du paiement, il faut se reconnecter.
- **Annuaire** :
  - tri par `priceAr` qui place en tête les membres sans offre ;
  - membres d'entreprises non payées listés ;
  - `isTopOffer` calculé sur toutes les offres, y compris inactives.
- **Deal Room** :
  - budget en € ignoré par les filtres et le tri ;
  - pas de liste « mes opportunités », donc `/deal-room/[id]/modifier` est pratiquement injoignable ;
  - pagination vide au-delà de 300 opportunités.
- **Profils** : `/membres/[id]` affiche les comptes suspendus ou exclus.
- **Statuts d'onboarding** (`lib/onboarding-status.ts`) :
  - « Vérification par l'administration » cochée avant toute vérification ;
  - collaborateurs placés avant le paiement ;
  - invitations révoquées comptées.
- **Réinitialisation** : `/login?reset=success` est ignoré, aucun message après la réinitialisation.
- **Abonnements** : aucune action pour suspendre ou annuler un abonnement, aucun passage automatique en EXPIRED.
- **Temps réel** : `conversation:typing` sans `conversationId` (l'indicateur s'affiche dans la mauvaise conversation) ; `connectedUsers` en mémoire, donc faux en multi-instance.
- **Verrou Redis** : `lib/redis-lock.ts` libère sans vérifier le détenteur ; sans Redis, aucun verrou.

---

## 3. P2 — Code mort

**Question au client :** supprime-t-on pour de bon les crédits, le check-in/QR, les paliers et le parcours candidature, y compris dans le schéma ?

**Recommandation (retenue le 7 octobre) :**

- **Code** : oui, le supprimer.
- **Base** : garder les tables en lecture seule jusqu'à vérifier qu'aucun historique n'en dépend, puis migrer.

### 3.1 Ce qui part si la décision est oui

- **Crédits Deal Room** :
  - actions et composants : `app/actions/credits.ts`, `components/credits/buy-credits-form.tsx`, `lib/credit-deduction-lock.ts` ;
  - réglages admin : `tariffs-form.tsx`, `deal-room-contact-cost-form.tsx`, `grantCredits` ;
  - affichages : tuile et lignes crédits de `/admin/finances` et de l'export, onglet Crédits de `/admin/membres/[id]` ;
  - le reste : 2 emails, `lib/payment-confirmations.ts` (crédits accordés à la confirmation, `confirmCreditPurchaseCore`), cas `credit_purchase` du webhook ;
  - schéma : `CreditBalance`, `CreditTransaction`, `CreditPackPrice`, `CreditPurchase`, `Plan.includedCredits` et `hasUnlimitedCredits`.
- **Check-in/QR** :
  - écran et composants : `/admin/evenements/[id]/checkin`, `checkin-scanner`, `qr-camera-scanner`, `checkpoint-manager` ;
  - logique : `checkInRegistration`, actions checkpoints, canal socket `checkin:*` ;
  - le reste : dépendance `jsqr`, colonne CSV « Check-in » ;
  - schéma : `EventCheckpoint`, `badgeQrCode`, `checkedIn`, `checkedInAt`.
  - On garde `qrcode`, qui sert au QR de partage d'offre.
- **Paliers** :
  - `TIER_BADGE`, copié dans 13 fichiers ;
  - filtres « Accès » et « Niveau » (événements, salles, annuaire, services, admin) ;
  - `tier` dans le JWT et dans les props `AppShell` ;
  - `{{tier}}` dans les broadcasts ;
  - segments CHAIRMAN/EXECUTIVE ;
  - `Event.minTier` et `Room.minTier`.
- **Candidature et activation** :
  - parcours membre : `/demande-acces`, `apply.ts`, `/activer/[token]` ;
  - côté admin : `/admin/candidatures`, `candidature-*.tsx` ;
  - emails : `application-*`, `activation-email` ;
  - modèle `MembershipApplication`.
- **Divers** :
  - webhook Resend, inopérant depuis le passage en SMTP, avec `openCount` et la colonne « Taux d'ouverture » ;
  - dépendances sans aucun import : `supertest` et `@types/supertest`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-toast` ;
  - 5 SVG hérités du gabarit Next.js ;
  - environ 60 tests qui ne testent que ce code mort.

### 3.2 Ce qui reste (vérifié)

- **Inscription et invitations** : `createCompanyAccount`, `acceptCompanyInvite`.
- **Connexion** : authentification anti-énumération, réinitialisation de mot de passe.
- **Places et paiement** : `seatCap`, `company-payment-amount`, les suppléments.
- **Sécurité technique** : HMAC, chiffrement des messages, verrou d'inscription, contrôle des préfixes d'upload.
- **Deal Room** : `sortByCompanyRelevance`.
- **Stockage des fichiers** : `api/dev/local-storage` **n'est pas du code mort**. C'est elle qui sert tous les fichiers en production (pas de R2). Elle est à renommer, pas à supprimer.

### 3.3 Autres décisions ouvertes

1. `/catalogue/services` : **reliée au menu** (décision du 7 octobre, commit `4a48e92`). Entrée « Services » dans la barre latérale desktop, après « Liste des membres ». Pas d'entrée dans la barre mobile, qui n'a pas non plus la liste des membres.
2. Bibliothèque d'emails éditable : **intégrée** (décision du 7 octobre, fusion `78b15fe`). Elle est accessible dans `/admin/emails`. Les modèles des fonctionnalités retirées en P2 sont sortis du registre. Les anciens composants `emails/*.tsx` et l'onglet « Templates automatiques » de `/admin/communications` sont supprimés. La migration `20260925120000_add_email_template_overrides` partira avec le prochain déploiement.

### 3.4 Réalisé le 7 octobre (branche `cleanup/p2-code-mort`)

| Lot                       | Commit    | Contenu                                                                                                                                                                                               |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crédits Deal Room         | `31dd969` | Actions, pages, formulaires admin, emails, verrou de déduction, lignes finances et export. Le webhook paiement refuse `credit_purchase`.                                                              |
| Check-in/QR               | `5321348` | Écran et scanner, postes de contrôle, canal socket `checkin:*`, dépendance `jsqr`, colonne CSV « Check-in ».                                                                                          |
| Candidature et activation | `da41bf1` | `/demande-acces`, `/activer/[token]`, `/admin/candidatures`, actions, emails. Un compte encore `PENDING_ACTIVATION` est invité à contacter l'équipe.                                                  |
| Paliers                   | `a31d388` | Badges, filtres « Niveau » et « Accès », tri par palier, choix du palier minimum, `tier` du JWT et d'AppShell, `{{tier}}`, segments CHAIRMAN/EXECUTIVE. Le tableau de bord affiche le nom de l'offre. |
| Divers                    | `0503854` | Webhook Resend et taux d'ouverture, 4 dépendances, 5 SVG du gabarit.                                                                                                                                  |

**Conservé en base, en lecture seule :** tables et colonnes des crédits, du check-in, des candidatures, des jetons d'activation et des paliers (`minTier`, `visibility`, `openCount`). La migration de suppression viendra après vérification de l'historique.

**Points à connaître :**

- **Finances** : les achats de crédits déjà confirmés n'apparaissent plus dans `/admin/finances` ni dans l'export comptable.
- **Accès** : le contrôle reste fondé sur l'abonnement de l'entreprise (`getViewerTierFromCompany` non nul). Le renommer en simple booléen relève de P3.
- **Déploiement** : les commentaires du `Dockerfile` et de `docker-compose.prod.yml` justifient encore une base joignable au build par `/demande-acces`, qui n'existe plus. À revoir en P1, sans toucher la procédure tant qu'elle n'est pas retestée.
- **Laissé en place** : la redirection `/catalogue/[id]` vers `/membres/[id]` (anciens liens) et la route de stockage `api/dev/local-storage` (à renommer, §3.2).

---

## 4. P1 — Git et dépôt parent

- **`refactor/dette-technique`** (worktree `APP V3`) : 2 de ses correctifs ont été repris en P0 (`a45e982`, `f3f8beb`). Restent à porter :
  - `a66a748` : effacement des données personnelles, RGPD et Loi 25 ;
  - `e23b4b2` : statut de contact WITHDRAWN distinct de DECLINED ;
  - `c364c6f` : validation Zod des candidatures, sans objet si P2 retire ce parcours ;
  - `4f89a3b` : constante unique pour les statuts CONFIRMED/PAID.

  Ensuite, supprimer la branche et le worktree.

- **`main`** : entièrement contenu dans `mvp-connect-simple`. L'avancer en fast-forward, ou en faire la branche de production.
- **Dépôt parent** :
  - à supprimer : `app;C/`, `Le serveur tourne maintenant sur ht.txt` (contient les mots de passe de démo), `.DS_Store`, le worktree `.kilo/worktrees/*` ;
  - à déplacer dans `docs/business/` : les `.docx`, `.pdf` et `.rtf`, et `logo.ai` ;
  - à archiver dans `docs/archive/` : les `AUDIT_*` d'août et `BACKLOG_DEV.md` ;
  - à décider : la copie HTML du site (« Engagement 2025 – CEO SUMMIT ») et les wireframes.

---

## 5. P3–P5 — Structure cible

Les dossiers de routes `app/` restent en place (contrainte du routeur Next.js) et deviennent de simples pages fines. La logique va dans `modules/<nom>/{actions.ts, queries.ts, rules/, components/, emails/, validations.ts, *.test.ts}`, et le socle commun dans `shared/` (prisma, stockage, email, rate-limit, redis, utils, ui).

Les dix modules :

- auth-onboarding ;
- entreprise-abonnement ;
- offres ;
- événements ;
- deal-room ;
- salles ;
- messagerie ;
- annuaire-services ;
- communications ;
- admin.

La migration se fait un module à la fois, en commençant par deal-room et messagerie, qui sont isolés.

**Fichiers à scinder :**

- `company-invites.ts` (561 lignes) ;
- `socket-server.ts` (527 lignes, trois domaines mélangés) ;
- `dashboard/page.tsx` (432 lignes) ;
- `publish-wizard.tsx` (457 lignes) ;
- `lib/utils.ts` (mélange `cn`, formatage et libellés métier).

**Dossiers à fusionner :** `components/events` et `components/evenements`.

**Tests à ajouter :**

- `middleware.ts` (le mur d'accès) ;
- `auth.config.ts` ;
- `lib/plan-access.ts` (37 fichiers l'importent) ;
- `lib/hmac.ts`, `lib/r2.ts` ;
- la route qui sert les fichiers ;
- une suite d'intégration sur le Postgres déjà démarré par la CI (paiement, invitations, abonnements) ;
- l'inclusion des fichiers `.tsx` dans Vitest.

**Commentaires :** 187 fichiers sur 419 racontent l'historique (« Audit du 25 septembre… », identifiants `E#-T#`) au lieu d'expliquer le code. On les nettoie module par module, au fil de P3. Le README (649 lignes) décrit encore 5 rôles par palier : il sera réécrit pour le MVP, et son historique déplacé dans un changelog.
