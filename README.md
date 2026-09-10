# CEO Summit Platform — App

Plateforme B2B CEO Summit : membership, événements, Deal Room, salles thématiques, messagerie.
Stack : Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Prisma · PostgreSQL · Redis · NextAuth v5.

Voir `/BACKLOG_DEV.md` (racine du projet) pour la liste complète des tâches par epic.
Voir `DEPLOY.md` pour déployer sur un VPS (Docker Compose, testé de bout en bout localement).

## Démarrage rapide

```bash
# 1. Dépendances
npm install

# 2. Base de données + cache (Docker)
docker-compose up -d

# 3. Variables d'environnement
cp .env.example .env
# éditer .env : au minimum DATABASE_URL, NEXTAUTH_SECRET (openssl rand -base64 32)

# 4. Schéma + client Prisma
npm run db:migrate      # applique prisma/migrations/ (baseline "init" déjà committée)
npm run db:generate
npm run db:seed        # crée admin@ceo-summit.mg / ChangeMe123! et demo@ceo-summit.mg / Demo1234!

# 5. Lancer le serveur de dev
npm run dev

# 6. (optionnel) Serveur Socket.io pour les salles thématiques temps réel (E4)
npm run socket:dev
```

Ouvrir http://localhost:3000 → redirige vers `/login`. Sans l'étape 6, tout le reste de
l'app fonctionne normalement — seules les pages `/salles` et `/salles/[id]` perdent le
temps réel (compteur en ligne, messages live) et affichent une erreur de connexion.

## Comptes de test (après seed)

| Rôle                | Email               | Mot de passe |
| ------------------- | ------------------- | ------------ |
| Admin (Super Admin) | admin@ceo-summit.mg | ChangeMe123! |
| Membre (Chairman)   | demo@ceo-summit.mg  | Demo1234!    |

**Changer ces mots de passe avant tout déploiement staging/prod.**

## Structure

```
app/                    App Router — pages, layouts, route handlers
  (member routes)       /dashboard, /deal-room, /evenements, /catalogue, /salles, /messagerie, /profil, /entreprise
  admin/                Backoffice — protégé par middleware (role === ADMIN)
  api/                  Route handlers (auth, webhooks payments/Zoom/Resend)
components/
  ui/                   Composants shadcn/ui (Button, Card, Dialog, Tabs...) — palette navy/gold CEO Summit
  layout/                AppShell (membre), AdminShell (backoffice), MobileBottomNav (PWA)
  auth/                  LoginForm et formulaires liés
lib/                     Prisma singleton, utils (cn, formatAriary, formatDateFr)
prisma/                  schema.prisma, migrations/, seed.ts
types/                   Extensions de types (next-auth.d.ts)
emails/                  Templates React Email (Resend) : activation, reset password
```

## Design system

Les tokens (navy `#1A2B5F`, gold `#C9A84C`, surface `#F7F7F5`...) sont dans `tailwind.config.ts`
et mappés en variables CSS shadcn dans `app/globals.css`. Utiliser directement `bg-navy`,
`text-gold`, etc. dans les classNames — pas de couleurs en dur.

Composants shadcn déjà installés manuellement (pas besoin de `npx shadcn add`) : button, card,
badge, input, label, avatar, dialog, tabs, alert, separator, select, checkbox, radio-group,
progress, sonner (toast). Pour en ajouter d'autres cohérents avec ce theme, utiliser
`npx shadcn@latest add <component>` — `components.json` est déjà configuré.

## Authentification & RBAC

- `auth.ts` : config NextAuth v5, provider Credentials (email + bcrypt), JWT 24h.
- `middleware.ts` : mur RBAC grossier (authentifié / admin / statut actif). Les vérifications
  fines de tier (ex: "cette opportunité nécessite Executive+") se font dans la page/l'action serveur.
- 5 rôles : `GUEST < MEMBER < EXECUTIVE < CHAIRMAN`, + `ADMIN` séparé pour le backoffice.

## Tests

```bash
npm test              # Vitest — suite complète (run once)
npm run test:watch    # mode watch
npm run test:coverage # rapport de couverture
```

Couverture actuelle (523 tests) : webhook paiement générique, webhook Resend (E8-T09), actions
d'auth (activation, mot de passe oublié, onboarding, profil), actions
membres/candidatures/événements admin, logique de requête catalogue/événements/
membres/Deal Room/salles/conversations/services/broadcasts/finances
(`lib/catalogue.ts`, `lib/events-query.ts`, `lib/admin-members-query.ts`,
`lib/deal-room-query.ts`, `lib/rooms-query.ts`, `lib/conversations-query.ts`,
`lib/services-query.ts`, `lib/admin-deal-room-query.ts`, `lib/broadcast-segments.ts`,
`lib/broadcast-template.ts`, `lib/finance.ts`), lock Redis générique et ses deux
usages (capacité événement, déduction de crédits), actions Deal Room (publication,
prise de contact, accepter/refuser un contact, modération admin), crédits (achat,
confirmation admin), salles (lecture, signalement, modération admin, CRUD admin),
messagerie (chiffrement pgcrypto, notification email hors-ligne), catalogue de
services (dépôt, modération admin), broadcasts admin (segmentation, envoi test,
envoi réel, webhook d'ouverture), finances admin (validation paiement événement,
relances renouvellement, export comptable) et paramètres plateforme (tarifs
membership/crédits, référentiels, promotion/gestion des comptes admin), et le
serveur Socket.io autonome
(`server/socket-server.ts` — auth,
accès par tier, rate limiting, persistance/broadcast pour les salles ET les
conversations privées, testé via un vrai client socket.io-client contre un serveur
éphémère). Les pages
elles-mêmes (composants React) n'ont pas de tests de rendu — seule la logique
serveur/pure est testée pour l'instant.

## Note environnement de build

`@prisma/client` nécessite un accès réseau à `binaries.prisma.sh` pour télécharger le moteur —
si votre environnement CI/sandbox bloque ce domaine, `prisma generate` échouera avec une 403.
Ce n'est pas un problème de code ; ça fonctionne normalement en local et sur CI standard
(GitHub Actions, Vercel, etc.).

## État d'avancement (E0 / E1)

- ✅ E1-T01 : NextAuth + middleware RBAC (mur grossier — les vérifications fines de tier
  se font page par page à mesure qu'elles existent)
- ⚠️ E1-T02 : Webhook Evolia (`/api/webhooks/evolia`) — retiré pendant la purge Phase 3
  (adhésions individuelles). Remplacé (7 août 2026) par un webhook de confirmation
  générique et agnostique du prestataire : `/api/webhooks/payments`, voir
  `lib/payment-confirmations.ts`. Aucun prestataire n'est branché à ce stade ; la
  validation manuelle admin reste le chemin principal, le webhook n'est qu'un
  chemin de confirmation automatique en plus.
- ✅ E1-T03 : Page d'activation (`/activer/[token]`) — token expiré → renvoi de lien,
  token déjà utilisé → redirect `/login`
- ✅ E1-T04 : Page de connexion (`/login`)
- ✅ E1-T06 : Mot de passe oublié (`/mot-de-passe-oublie`, `/reinitialiser/[token]`)
- ✅ E1-T05 : Onboarding `/bienvenue` — tutoriel 4 étapes (bienvenue, profil, secteurs,
  clôture), skippable, chaque étape sauvegardée immédiatement (`onboardingCompletedAt`
  empêche le re-déclenchement aux connexions suivantes). Photo de profil et entreprise
  ne sont pas couvertes ici — elles dépendent de E2-T02 (upload R2) et E2-T05 (entités
  Company) qui n'existent pas encore. Le lien `/demande-acces` dans `LoginForm` reste
  mort : ce n'est pas une tâche numérotée du backlog E1 (candidature membership, hors
  scope actuel).
- 🟡 PWA : les icônes manifest (`public/icons/icon-*.png`) et le logo affiché dans
  l'app (`public/logo/`) sont désormais les vrais exports de marque CEO Summit
  (remplacent les placeholders navy/gold générés) — variante couleur sur fond clair
  (`ceo-summit-logo.png`, utilisée par `AuthCard`) et variante blanche sur fond sombre
  (`ceo-summit-logo-dark.png`, utilisée par les sidebars membre/admin et le panneau
  gauche de `/login`). Il manque toujours `next-pwa`/service worker (reste E9-T01).

### E2 — Profils membres & entreprises

- ✅ E2-T01 : Page profil membre (`/membres/[id]`) — onglets Profil/Entreprise/Deal Room/
  Services (les deux derniers en `EmptyState` tant qu'E5/E6 n'existent pas), vue propre
  (bouton "Éditer mon profil") vs vue autre membre (bouton "Envoyer un message", téléphone
  masqué). "Demander une connexion" est désactivé — c'est une action Deal Room (E6) qui
  n'existe pas encore.
- ✅ E2-T02 : Édition profil (`/profil/editer`) — upload photo (`/api/profile/avatar`,
  resize serveur 400×400 via `sharp`, stockage R2), nom/titre/bio/LinkedIn/pays/secteurs,
  validation Zod. Testé (Vitest, upload + validations).
- ✅ E2-T03 : Catalogue membres (`/catalogue`) — grille de cartes, filtres (secteur,
  pays, tier, mot-clé), tri (récent/alphabétique/tier), pagination classique. La
  logique de construction de requête est isolée dans `lib/catalogue.ts` (pure,
  testée) plutôt qu'inline dans la page.
- ✅ E2-T04 : Fiche détail membre (`/catalogue/[id]`) — canonicalise vers
  `/membres/[id]` plutôt que dupliquer la vue riche déjà construite en E2-T01
  (même concept que le wireframe `catalogue-fiche.html`).
- ✅ E2-T05 : Profil entreprise (`/entreprises/[id]`) — logo/nom/secteur/description/
  site web, liste des membres rattachés, onglets Deal Room/Services en `EmptyState`
  (E5/E6 pas construits). `/entreprise` (lien sidebar "Mon Entreprise") redirige vers
  la fiche du viewer si `companyId` est renseigné, sinon état vide explicite — pas de
  flux de création d'entreprise (hors scope backlog actuel).

**E2 est maintenant complet (5/5).**

### E3 — Événements & inscriptions

- ✅ E3-T01 : Liste des événements (`/evenements`) — grille, filtres type/date/accès,
  badges de capacité (Complet/Places limitées/Bientôt), section "Événements passés"
  séparée. A nécessité d'ajouter `Event.type` (enum `EventType`) au schéma — absent
  jusqu'ici, or le backlog exige explicitement un filtre par type.
- ✅ E3-T02 : Détail événement (`/evenements/[id]`) — programme, intervenants,
  participants inscrits, capacité restante. Le lien Zoom n'est jamais exposé publiquement
  (même logique que le wireframe : envoyé par email aux seuls inscrits) — l'intégration
  Zoom API réelle (création automatique de meeting) est E3-T05 (admin), pas construite.
- ✅ E3-T03 : Inscription + paiement (`/evenements/[id]/inscrire`) — stepper 3 étapes
  (récapitulatif, mode de paiement virement/mobile money/inclus, confirmation),
  vérification de capacité via lock Redis (`lib/event-registration-lock.ts`, SET NX)
  pour éviter l'overbooking, email de confirmation avec badge QR (`qrcode`), alerte
  admin par email si virement (validation manuelle — pas de passerelle de paiement
  réelle intégrée, ni pour virement ni pour mobile money).
- ❌ E3-T04 (QR Badge & Check-in) et E3-T05 (CRUD événements admin) : pas commencés —
  T05 dépend d'E8 (auth + layout admin), qui n'existe pas encore. Sans lui, les
  événements ne peuvent être créés que via `prisma/seed.ts` (5 événements de démo).

⚠️ **Redis n'est pas disponible dans cet environnement de dev** (pas de Docker ici) —
le lock de capacité est testé unitairement avec un client Redis mocké, jamais vérifié
contre une vraie instance. Même caveat que PostgreSQL : fonctionne normalement une fois
`docker-compose up -d` lancé localement.

### E8 — Backoffice admin (démarré)

- ✅ E8-T01 : Auth admin + layout BO (`/admin`, protégé par middleware + vérifié à
  nouveau dans `app/admin/layout.tsx`). Sous-rôles `super_admin | moderateur | financier`
  (`AdminUser.role`) avec RBAC granulaire par section (`lib/admin-rbac.ts`, testé) —
  `AdminSidebar` masque les sections que le sous-rôle ne peut pas atteindre (ex :
  financier ne voit pas Paramètres/Candidatures/Membres).
- ✅ E8-T02 : Dashboard admin (`/admin`) — KPIs (membres actifs par tier, MRR estimé,
  candidatures en attente, remplissage du prochain événement), strip d'alertes
  (candidatures/paiements/signalements en attente, masqué si tout est à 0), graphique
  revenus 12 mois (Recharts), activité récente, tableaux candidatures/événements à venir.
  **Aucune métrique n'est inventée** : pas de deltas ("+12 ce mois") comme dans le
  wireframe — il n'existe pas d'historique/snapshot pour les calculer honnêtement, donc
  ils ne sont simplement pas affichés plutôt que fabriqués. Le MRR est une estimation
  (prix total de chaque adhésion active réparti sur sa durée), pas une vraie ligne de
  facturation récurrente.
- Seed : 2 candidatures (`MembershipApplication`) de démo ajoutées — aucune UI de
  candidature n'existe encore pour en créer réellement (UC-01/02/03 du module 01,
  hors scope backlog E1-E3 actuel).
- ✅ E8-T03 : Gestion candidatures (`/admin/candidatures`, `/admin/candidatures/[id]`)
  — tabs par statut, détail avec décision (valider avec choix du tier / refuser /
  demander complément d'info), note interne. **Valider crée le compte** (comme une
  "sélection directe" UC-03) et envoie l'email d'activation déjà existant — mais ne
  crée aucune `Membership` : le candidat n'a pas encore payé via Evolia, cette étape
  ne fait que débloquer la création de compte. Le refus **ne communique jamais le
  motif interne au candidat** (RG-07) — l'email de refus est volontairement générique,
  même si le wireframe suggérait le contraire.
- ✅ E8-T04 : Gestion membres (`/admin/membres`, `/admin/membres/[id]`) — liste avec
  filtres (tier/pays/secteur/statut/recherche) + pagination, détail en 5 onglets
  (Profil, Activité, Crédits, Paiements, Notes admin). Actions : changer tier (met à
  jour l'adhésion active ou en crée une à prix 0 si aucune n'existe), suspendre/
  exclure/réactiver, attribuer des crédits (bucket `purchased`, tracé en
  `CreditTransaction` de type `ADMIN_GRANT`). Ajout de `User.adminNote` au schéma
  (absent jusqu'ici, nécessaire pour l'onglet Notes admin).
- ✅ E8-T05 : Gestion événements admin (`/admin/evenements`, `nouveau`, `[id]/editer`)
  — création/édition, upload bannière (R2, resize serveur 1200×675), statuts
  draft → published → cancelled. Programme et intervenants s'éditent en texte libre
  (une ligne = un élément) plutôt qu'avec un éditeur de blocs (voir `lib/event-content.ts`)
  — simplification délibérée, pas un éditeur multi-blocs comme le wireframe. **Pas
  d'intégration Zoom API réelle** (pas de clés sandbox) ni d'emails automatiques J-7/J-1
  (aucune infra de tâche planifiée dans ce projet — ce serait EX-T03, pas construit).
- ❌ E8-T06 → T11 (Deal Room, salles, crédits, communications, finances, paramètres) :
  pas commencés.

**E8 est maintenant à 5/11.**

### E3-T04 — QR Badge & Check-in

- ✅ Badge numérique (`/evenements/[id]/badge`) — QR code intégré en image data:
  (fonctionne offline une fois la page chargée), non disponible si l'inscription
  n'est pas confirmée.
- ✅ Check-in admin (`/admin/evenements/[id]/checkin`) — code de badge saisi/collé
  plutôt que scanné à la caméra (aucune lib de scan ajoutée) ; la logique de
  validation (marquer `checkedIn`) est réelle, seule l'interface de scan est
  simplifiée.
- ✅ Export CSV des inscrits (`/api/admin/evenements/[id]/export`).

**E3 est maintenant complet (5/5).**

### E6 — Deal Room & Crédits

- ✅ E6-T01 : Liste des opportunités (`/deal-room`) — filtres type/secteur/pays/budget,
  tri, pagination (`lib/deal-room-query.ts`, testé). Bannière de solde de crédits en
  tête de page (`Illimité` pour Chairman).
- ✅ E6-T02 : Détail opportunité (`/deal-room/[id]`) — visibilité par tier en
  défense-en-profondeur (double vérification : requête + page, `allowedVisibilities()`),
  prise de contact (`ContactPanel`) qui déduit 1 crédit sauf pour l'auteur ou un membre
  Chairman (illimité). Redirection vers `/credits/acheter` si solde insuffisant.
- ✅ E6-T03 : Publication d'opportunité (`/deal-room/publier`) — stepper 4 étapes,
  pièces jointes PDF (3 max, 10 Mo, upload R2 via `/api/deal-room/attachment`).
  Toute nouvelle opportunité part en `PENDING_MODERATION` et alerte l'admin par email —
  **il n'existe pas encore d'écran de modération dédié** (file d'attente, valider/
  refuser avec motif) : ce serait la suite naturelle d'E8-T06, pas construite ici.
- ✅ E6-T04 : Déduction de crédit atomique — `withCreditDeductionLock` (lock Redis
  générique `lib/redis-lock.ts`, réutilisé/extrait du lock de capacité événement)
  encapsule une transaction Prisma qui vérifie le solde puis incrémente `used` et
  journalise un `CreditTransaction` (`DEDUCTION`, -1). Empêche qu'un double-clic ou
  deux requêtes concurrentes ne fassent passer le solde en négatif.
- ✅ E6-T05 : Achat de crédits (`/credits/acheter`) — sélection d'un pack + mode de
  paiement (virement/mobile money, même énumération que les événements — pas de
  nouvel enum), demande envoyée en attente de validation admin (`CreditPurchase`,
  nouveau modèle + migration). Validation minimale côté admin ajoutée à
  `/admin/credits` (confirmer crédite le solde `purchased` + email au membre ; refuser
  clôture la demande) — **c'est un amorçage d'E8-T07**, pas la page complète (pas de
  vue des soldes par membre ni d'email de relance/upsell).
- Seed : 4 opportunités de démo ajoutées (types/secteurs/pays/visibilités variés) —
  aucune UI de modération n'existe encore pour en publier de nouvelles autrement que
  via `/deal-room/publier` (qui les met en attente, jamais publiées automatiquement).

⚠️ Même caveat que pour Redis/PostgreSQL ailleurs dans ce document : le lock de
crédits est testé unitairement avec un client Redis mocké, jamais vérifié contre une
vraie instance dans cet environnement.

**E6 est maintenant complet (5/5).**

### E4 — Salles thématiques (temps réel)

- ✅ E4-T01 : Serveur Socket.io autonome (`server/socket-server.ts`, `npm run socket:dev`)
  — **pas un custom server Next.js** (qui aurait touché `next dev`/`next build`) : un
  process Node séparé, l'autre alternative explicitement citée par le backlog. Auth par
  JWT court terme (`/api/socket/token`, signé avec `NEXTAUTH_SECRET`) plutôt que
  décodage de cookie de session (ce process n'a pas accès à `auth()`). Vérification
  d'accès par tier + suspension à chaque `room:join`, rate limiting 1 msg/s par socket,
  adapter Redis Pub/Sub activé seulement si `REDIS_URL` est configuré (sinon adapter
  en mémoire — suffisant pour une seule instance).
- ✅ E4-T02 : Liste des salles (`/salles`) — filtres secteur/accès (`lib/rooms-query.ts`,
  testé), verrouillage visuel si tier insuffisant, badge "nouveau message" (nouveau
  modèle `RoomRead` — absent du schéma initial, ajouté car explicitement requis par le
  backlog). Compteur "en ligne" : un seul aller-retour vers le serveur Socket.io au
  chargement (`rooms:presence`), pas un flux temps réel sur cette page — un visiteur n'a
  rejoint aucune salle donc rien ne peut lui être poussé en direct avant qu'il en ouvre une.
- ✅ E4-T03 : Chat de salle (`/salles/[id]`) — messages temps réel, indicateur de frappe,
  présence en ligne réelle, upload de pièce jointe (R2, 5 Mo, tous types), signalement de
  message. Historique paginé : les 50 derniers messages chargés côté serveur, un bouton
  "Charger les messages précédents" appelle `/api/rooms/[id]/messages?before=` pour le
  reste (pas d'auto-scroll infini par `IntersectionObserver` — un bouton explicite, plus
  simple et suffisant pour l'usage attendu).
- ✅ E4-T04 : Modération (`/admin/salles`) — file de signalements avec les 4 issues du
  wireframe (`ReportStatus` : supprimer le message / avertir par email / exclure de la
  salle via un nouveau modèle `RoomSuspension` avec durée configurable / ignorer),
  archivage/restauration de salle. **Pas de "créer une salle" en admin** — comme pour
  les événements et opportunités avant leur CRUD dédié, les salles sont seedées ; ce
  n'est pas un bullet du backlog E4-T04 (seulement modération), donc pas construit ici.
- Seed : 3 salles de démo (accès Tous membres / Executive+ / Chairman uniquement) + 2
  messages d'exemple dans la salle Énergie.

⚠️ Contrairement aux epics précédents, **cette fois testé contre une vraie instance
PostgreSQL locale et un vrai serveur Socket.io** (join, message, broadcast, vérifiés en
direct) — seul le fallback Redis reste non testé en conditions réelles (pas de Redis
disponible dans cet environnement de dev ; le code tolère son absence, testé pour
l'absence de crash au démarrage sans `REDIS_URL`).

**E4 est maintenant complet (4/4).**

### E7 — Messagerie privée

- ✅ E7-T01 : Liste des conversations (`/messagerie`) — layout partagé avec `/messagerie/[id]`
  (`app/messagerie/layout.tsx`, la liste ne se recharge jamais en changeant de thread),
  badge non-lu, aperçu déchiffré du dernier message. **Recherche implémentée côté client**
  (liste déjà chargée/déchiffrée, filtre instantané) plutôt qu'en aller-retour serveur par
  frappe — choix délibéré, pas une simplification par défaut.
- ✅ E7-T02 : Thread (`/messagerie/[id]`) — messages temps réel, indicateur de frappe,
  présence en ligne, indicateur "Lu" (double coche), historique paginé (50 messages +
  bouton "Charger les précédents"). **Chiffrement au repos via pgcrypto réel** :
  `Message.content` est stocké en `bytea` (`pgp_sym_encrypt`), déchiffré uniquement
  côté serveur (`lib/message-crypto.ts`, raw SQL — Prisma n'a pas de chiffrement de
  champ natif) et jamais renvoyé chiffré au client. Vérifié en direct contre la vraie
  base (chiffrement, déchiffrement, et redémarrage à froid après rotation de la clé).
  Pas de pièce jointe dans le chat (pas un bullet de T02, contrairement à E4-T03).
- ✅ E7-T03 : Notification email (`server/offline-message-notifier.ts`) — si le
  destinataire n'a aucune socket connectée 60s après l'envoi, email avec aperçu +
  bouton "Répondre", au plus 1 par conversation par heure (`Conversation.lastEmailNotifiedAt`,
  nouveau champ). "Hors ligne" = aucune socket ouverte sur l'ensemble de l'app (pas
  seulement hors du thread) — dépend donc d'avoir déjà visité `/salles` ou `/messagerie`
  au moins une fois dans la session pour qu'une socket existe.
- ✅ E7-T04 : Lien Deal Room — **complète un flux laissé inachevé par E6** : le schéma
  avait toujours `OpportunityContact.status`/`conversationId` prévus pour un
  accepter/refuser, mais E6 créait le contact directement sans jamais les utiliser, et
  sans que l'auteur soit informé qu'une demande existait. Ajout de l'email de demande
  de contact, d'un panneau "Demandes reçues" sur `/deal-room/[id]` (accepter → crée la
  conversation automatiquement / refuser), et du lien "Voir la conversation" une fois
  acceptée.
- Entrée "Envoyer un message" déjà présente sur `/membres/[id]` depuis E2 (`?new=<id>`,
  jamais câblée avant) ; `/catalogue/[id]` redirige déjà vers `/membres/[id]`.
- Seed : 1 conversation de démo (admin ↔ membre démo) avec 2 messages, chiffrés pour de
  vrai via `pgp_sym_encrypt` — pas de texte en clair en base même pour la démo.

⚠️ Piège opérationnel rencontré et corrigé pendant le dev : `tsx watch` (utilisé par
`npm run socket:dev`) recharge le process sur changement d'un fichier `.ts`, **mais pas**
sur changement de `.env` — après avoir édité `MESSAGE_ENCRYPTION_KEY`, l'ancien process
continuait de chiffrer avec l'ancienne clé jusqu'à un redémarrage manuel. Si vous changez
une variable d'environnement pendant que `socket:dev` tourne, relancez-le.

**E7 est maintenant complet (4/4).**

### E5 — Catalogue de services

- ✅ E5-T01 : Liste (`/catalogue/services`) — filtres catégorie/pays/tier. Comme
  `ServiceListing` n'a pas ses propres champs pays/tier, "pays" retombe sur le pays de
  l'entreprise liée (ou celui de l'auteur si aucune entreprise) et "tier" filtre sur le
  niveau d'adhésion actif du prestataire — décrit explicitement en commentaire dans
  `lib/services-query.ts` pour éviter toute ambiguïté future.
- ✅ E5-T02 : Fiche (`/catalogue/services/[id]`) — description, tarif, galerie, bouton
  "Contacter" qui réutilise directement le hook `/messagerie?new=<id>` déjà posé par E2
  et câblé par E7 (aucune nouvelle logique de contact nécessaire).
- ✅ E5-T03 : Dépôt (`/catalogue/services/publier`) — stepper 3 étapes, galerie jusqu'à
  6 visuels (upload indépendant + redimensionnement serveur, même pattern que l'avatar/
  la bannière événement), statut `pending_moderation` → email admin. Limite "1 fiche
  active par entreprise (Member/Executive), illimité Chairman" appliquée par
  `authorId`/`companyId` selon que l'auteur a une entreprise liée ou non.
- **Modération admin ajoutée alors qu'aucune tâche E8-Txx ne la couvre explicitement** :
  T03 exige "Modération admin avant publication" mais aucun epic E8 n'a de bullet dédié
  au catalogue de services. Ajout d'une section `services` à `lib/admin-rbac.ts` (accès
  SUPER_ADMIN + MODÉRATEUR, comme Deal Room/Salles) et d'une page minimale
  `/admin/catalogue-services` (publier/refuser, email à l'auteur) plutôt que de laisser
  le dépôt sans aucune façon d'être validé.
- Seed : 2 fiches de démo publiées (Conseil & Stratégie, Juridique & Fiscal), sans
  visuel (pas d'assets R2 réels disponibles pour la démo).

**E5 est maintenant complet (3/3).**

### E8-T06 — Modération Deal Room admin (`/admin/deal-room`)

- ✅ File de modération (onglet "À valider") — carte par opportunité, checklist visuelle
  (non persistée : le backlog demande une aide à la revue, pas un stockage des réponses),
  décision en 3 issues (`OpportunityStatus`) : **Valider et publier**, **Demander des
  modifications** (message libre envoyé à l'auteur), **Refuser** (motif envoyé à
  l'auteur). Navigation précédente/suivante dans la file d'attente.
- ✅ Onglet "Actives" — recherche/type/secteur (`lib/admin-deal-room-query.ts`), action
  **Dépublier**.
- ✅ Onglet "Archivées" — dépubliées/refusées/expirées, action **Republier** pour les
  dépubliées uniquement.
- Note de modération : champ **interne admin uniquement** (`Opportunity.moderationNote`,
  déjà dans le schéma) — jamais envoyée au membre, distinct du motif de refus (qui, lui,
  **est** envoyé — contrairement à la règle RG-07 des candidatures, le wireframe
  `bo-deal-room-detail.html` est explicite : "Motif (envoyé au membre)").
- Stats en tête de page : uniquement des comptes réels (en attente / actives / contacts
  ce mois / refusées ce mois) — pas de deltas inventés ("+8 ce mois"), même règle que le
  dashboard admin (E8-T02).
- Vérifié en direct : opportunité de test insérée en attente → visible dans la file →
  page de décision/checklist/navigation rendue → onglet Actives affiche les vraies
  opportunités publiées du seed.

**E8-T06 fait maintenant partie des tâches livrées d'E8 (6/11).**

### E8-T08 — CRUD salles admin (`/admin/salles/nouveau`, `/admin/salles/[id]/editer`)

- ✅ Complète E8-T08 : la modération (signalements, archivage/restauration) était déjà
  livrée en E4-T04 ; il manquait la création/édition de salle elle-même. Formulaire
  nom/description/secteur/accès minimum (`RoomFormValues`), même pattern create/edit
  qu'`EventForm` (E3-T05).
- Vérifié en direct : page de création et page d'édition (préremplie avec une vraie
  salle du seed) toutes deux rendues avec succès.

**E8 est maintenant à 7/11.**

### E8-T09 — Communications & broadcasts (`/admin/communications`)

- ✅ Composer un broadcast — objet + corps avec variables `{{prénom}}` `{{nom}}`
  `{{tier}}` `{{entreprise}}` (`lib/broadcast-template.ts`), segmentation réelle
  (tous actifs / Chairman / Executive / personnalisé par pays+secteur —
  `lib/broadcast-segments.ts`, comptes en direct depuis la base), aperçu, envoi
  test (à l'admin connecté uniquement) et envoi réel (un email par destinataire,
  `Broadcast` + `BroadcastRecipient`, nouveaux modèles).
- ✅ Historique — liste des broadcasts envoyés avec taux d'ouverture réel.
- ✅ Webhook Resend (`/api/webhooks/resend`) — reçoit `email.opened`, marque le
  destinataire et incrémente le compteur d'ouvertures, idempotent (un second
  événement pour le même destinataire ne recompte pas). **Signature simplifiée** :
  vérifiée avec le HMAC générique déjà utilisé pour Evolia plutôt que le schéma
  Svix réel de Resend — il n'y a pas de compte Resend réel dans cet environnement
  pour déclencher un vrai webhook de toute façon ; brancher un vrai compte plus
  tard ne change que cette seule fonction de vérification.
- **"Envoi programmé" du wireframe non implémenté** — nécessiterait une infra de
  tâches planifiées qui n'existe pas dans ce projet (même limitation que les
  rappels J-7/J-1 et les relances de renouvellement, déjà documentée ailleurs).
- **"Édition des 6 templates" scopée honnêtement** : les templates sont des
  composants React Email versionnés dans le code (`emails/*.tsx`), pas du
  contenu éditable en base — l'onglet "Templates automatiques" les liste en
  lecture seule (nom, déclencheur, statut **réel** actif/non-automatisé — 2 des
  6 flux du wireframe n'ont jamais été automatisés dans ce projet faute de cron)
  plutôt que de simuler un bouton "Éditer" qui ne ferait rien.
- Vérifié en direct : les 3 onglets (composeur, templates, historique) rendus
  avec succès ; l'envoi réel d'email n'a pas pu être testé en direct — aucune
  clé Resend valide dans cet environnement (même limitation que tous les autres
  envois d'email du projet), couvert par les tests unitaires à la place.

**E8 est maintenant à 8/11.**

### E8-T10 — Finances admin (`/admin/finances`)

- ✅ Dashboard MRR/ARR (réutilise `computeMRR`, déjà construit pour E8-T02) +
  répartition par tier (`lib/finance.ts`), revenus réels du mois par source
  (membership/événements/crédits) — aucun delta inventé (le "+8.3% vs juin" du
  wireframe n'est pas repris), même règle que le dashboard admin.
- ✅ Abonnements expirant dans 30/60/90j (comptes réels, `@@index([status, endDate])`
  déjà anticipé dans le schéma) + relance manuelle par email
  (`sendRenewalReminders`) — "relance automatique" du wireframe non implémentée
  (pas d'infra de cron, même limitation documentée ailleurs), remplacée par un
  déclenchement manuel qui envoie réellement les emails plutôt que de simuler.
- ✅ **Débloque un vrai cul-de-sac** : une inscription événement payée par
  virement/mobile money restait en `PENDING` pour toujours — seul un email
  d'alerte admin existait (E3-T03), aucune action pour la confirmer.
  `confirmEventPayment` complète ce flux (statut → `CONFIRMED`/`PAID`, email de
  confirmation avec badge QR réutilisé). Les achats de crédits en attente
  réutilisent directement les actions déjà construites en E6.
- ✅ Export comptable CSV réel (`/api/admin/finances/export`), fusionnant les 3
  sources de paiement, même pattern que l'export inscrits événement (E3-T04).
- ✅ Onglet "Remboursements" — réel (`PaymentStatus.REFUNDED`), vide dans les
  données actuelles (aucun remboursement n'a jamais été traité dans ce projet).
- Vérifié en direct : dashboard, les 3 onglets et l'export CSV (contenu réel,
  triage chronologique correct) testés avec succès.

**E8 est maintenant à 9/11.**

### E8-T11 — Paramètres plateforme (`/admin/parametres`)

- ✅ **Débloque deux vraies impasses** : `PlatformSetting` (tarifs) et
  `Referential` (secteurs/pays/types d'opportunité) existaient dans le schéma
  depuis le début mais n'étaient lus/écrits par aucun code — les tarifs
  membership étaient codés en dur dans `CandidatureDecisionPanel`
  (`lib/platform-settings.ts` centralise désormais la lecture avec fallback
  par défaut par tier, testé), et `Referential` n'avait aucun CRUD.
- ✅ Onglet Tarifs & Règles — prix membership (3 tiers) + crédits inclus
  Executive/Member, prix des 3 packs crédits Deal Room (`CreditPackPrice`,
  déjà consommé par `/credits/acheter`) ; `CandidatureDecisionPanel` lit
  maintenant ces vraies valeurs au lieu du tableau codé en dur.
- ✅ Onglet Référentiels — CRUD réel (ajout/suppression) sur `Referential`.
  Limite documentée dans le code : les filtres membre-facing (`lib/sectors.ts`,
  `lib/countries.ts`, statiques, utilisés dans ~10 fichiers) ne consomment
  pas encore cette table — migration séparée, plus large que ce ticket.
- ✅ Onglet Administrateurs — liste des `AdminUser` (jointure manuelle avec
  `User`, car aucune relation Prisma n'existe entre les deux modèles),
  changement de rôle, activation/désactivation (garde-fou : un admin ne peut
  pas se désactiver lui-même). Contrairement au wireframe (qui crée un
  compte ex-nihilo), on **promeut un membre existant** trouvé par email —
  seul flux de création de compte cohérent avec le reste de la plateforme
  (webhook Evolia ou candidature approuvée).
- ✅ Onglet Intégrations — lecture seule, statuts réels basés sur la présence
  des variables d'environnement (Evolia, Resend, Cloudflare R2, Zoom) plutôt
  que les statuts fictifs du wireframe ("Mailjet", taux d'ouverture 54.2%,
  etc.). L'application mobile reste explicitement "en développement" — aucune
  API mobile n'existe dans ce projet.
- ✅ Accès restreint à SUPER_ADMIN (`lib/admin-rbac.ts` — "parametres" n'apparaît
  dans aucune autre liste de sections), déjà vrai avant ce ticket.
- Vérifié en direct : connexion SUPER_ADMIN, les 4 onglets retournent 200 et
  affichent les vraies données (tarifs par défaut, référentiels seedés,
  compte admin SUPER_ADMIN) ; upsert + suppression `PlatformSetting`
  vérifiés directement contre Postgres.

**E8 est maintenant complet (11/11).**

### E9 — PWA & Mobile (4/5)

- ✅ **E9-T01** — Configuration PWA complète. `@ducanh2912/next-pwa` (fork
  maintenu, compatible App Router — le paquet `next-pwa` original n'a pas
  été mis à jour depuis des années) génère un vrai service worker
  (`public/sw.js`, gitignoré — régénéré à chaque build). Cache
  `StaleWhileRevalidate` sur les pages membres, `NetworkFirst` dédié sur
  login/dashboard/messagerie (les 3 pages citées par le backlog) avec une
  rétention plus longue que le reste. Fallback offline réel
  (`app/~offline`) quand une page non cachée échoue sans réseau. 17 splash
  screens iOS (`apple-touch-startup-image`, portrait uniquement — le
  manifest déclare `orientation: portrait-primary`) générées depuis le vrai
  logo, table d'appareils partagée entre `lib/apple-splash-screens.ts` et
  `scripts/generate-splash-screens.mjs` — table assemblée à partir d'une
  source vérifiée (iPhone SE→11) + tailles iPhone 12-16 recoupées sur des
  références de viewport publiées, pas scrapée en direct depuis Apple HIG ;
  à considérer comme "bonne couverture des formats courants", pas une
  garantie exhaustive par modèle.
- ✅ **Débloque un vrai gap de sécurité** : le middleware RBAC excluait déjà
  `icons`/`manifest.json` de la vérification d'auth mais pas `sw.js` — un
  visiteur non connecté ne pouvait jamais réellement enregistrer le service
  worker (redirigé vers `/login` en tentant de le charger). Même correction
  appliquée à `/splash/*`.
- ✅ **E9-T02** — Bottom navigation mobile : déjà entièrement construite
  (5 onglets, badge non-lu, `safe-area-inset-bottom`) mais **le badge
  "Messages" n'était jamais alimenté** — aucune des ~18 pages membres ne
  passait de compteur réel à `AppShell`. Ajout de
  `countUnreadMessages()` (`lib/conversations.ts`, testé) et branchement
  sur chaque page membre (dont `/messagerie` qui calculait déjà ce total
  par conversation sans jamais le sommer).
- ✅ **E9-T05** — Bandeau d'installation (`components/layout/install-prompt.tsx`) :
  écoute `beforeinstallprompt` (Android/Chrome), affiché après la 2e visite
  (compteur `localStorage`) ; guide statique dédié pour Safari iOS (qui ne
  déclenche jamais cet événement) — "Partager → Sur l'écran d'accueil".
  Composant 100% client/`localStorage`, ne rend rien côté serveur par
  conception (évite un mismatch d'hydratation) — non vérifiable par simple
  requête HTTP, nécessiterait un vrai navigateur pour un test visuel complet.
- 🟡 **E9-T03** — Revue responsive : faite en lecture de code (pas de
  navigateur/appareil disponible dans cet environnement pour une QA
  visuelle réelle). 4 vrais écarts trouvés et corrigés : filtres Deal Room
  toujours visibles sans bouton de repli mobile (ajout d'un toggle
  "Filtres"), thread de messagerie sans bouton retour vers la liste sur
  mobile (ajouté), chat de salle utilisant `100vh` au lieu de `100dvh`
  (coupé par la barre d'adresse mobile) avec un champ de saisie non
  `sticky`, et les onglets (`TabsList`, composant partagé) sans défilement
  horizontal en cas de débordement. Non vérifié visuellement sur un vrai
  appareil.
- ❌ **E9-T04** (push notifications, P2/optionnel) — non fait. Nécessiterait
  des clés VAPID, un endpoint backend de souscription push et un flux
  opt-in RGPD complets : aucune de ces briques n'existe. Même limitation
  que Redis/Resend ailleurs dans ce projet — non simulé plutôt que faussement
  implémenté.

**E9 est maintenant à 4/5 (T04 explicitement hors scope, optionnel/P2).**

### EX-T01 — Sprint de correction sécurité/conformité/parcours/accessibilité

Audit complet mené le 29 juillet (4 agents indépendants : sécurité, RGPD,
parcours utilisateur cas par cas, accessibilité statique) —
`AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md`. 4 bloquants et plusieurs quick
wins corrigés le soir même :

- ✅ **`/demande-acces` créé** — le lien depuis `/login` pointait vers une
  route inexistante : le seul canal d'acquisition de nouveaux membres était
  cassé. Formulaire réel (`app/actions/apply.ts`, 7 tests), consentement RGPD
  horodaté (`MembershipApplication.consentedAt`), email d'accusé de
  réception. Pages `/cgu`/`/confidentialite` créées en brouillon explicite
  (contenu à valider par un juriste) pour que le lien de consentement ne
  pointe pas dans le vide.
- ✅ **Expiration d'adhésion enfin synchronisée** — `Membership.endDate`
  dépassée ne mettait jamais à jour `User.status` (aucun cron dans ce
  projet) : un membre expiré gardait un accès complet indéfiniment.
  `auth.ts` synchronise maintenant au moment de la connexion. Limite
  assumée : une session déjà ouverte reste valide jusqu'à 24h (durée du
  JWT) — pas un vrai remplacement de cron.
- ✅ **Boucle de redirection infinie corrigée** — un compte `EXPIRED`
  s'authentifiait avec succès puis tombait dans `/dashboard` ⇄ `/login` à
  l'infini. Bloqué au même endroit que `SUSPENDED` (déjà existant), avec un
  message dédié dans `login-form.tsx`.
- ✅ **Candidat approuvé sans paiement = accès gratuit illimité, corrigé** —
  nouveau gate dans `middleware.ts` (`/paiement-en-attente`) pour tout
  membre `ACTIVE` sans `tier`. **Bug annexe trouvé au passage** : le lien
  "Déconnexion" de la sidebar membre n'appelait jamais `signOut()` — un
  simple lien vers `/login` qui laissait la session active.
- 🟡 **Pièces jointes R2 : code corrigé, non vérifiable en direct** — URLs
  publiques permanentes remplacées par des URLs signées à durée de vie
  courte (`lib/r2.ts`, `Opportunity.attachments` et `RoomMessage.attachmentKey`
  renommé depuis `attachmentUrl`) + whitelist MIME sur l'upload de salle
  (absente avant). Aucune donnée seedée n'a de pièce jointe et les
  identifiants R2 de cet environnement sont vides — confirmé que l'appel
  échoue proprement plutôt que de planter silencieusement.
- ✅ **Les 6 en-têtes HTTP de sécurité** (HSTS, CSP, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy) + suppression
  de `X-Powered-By` — totalement absents avant. CSP en `'unsafe-inline'`
  plutôt qu'un système de nonces (chantier séparé). **Piège découvert en
  vérifiant le build** : une première version de `not-found.tsx` appelait
  `auth()`, ce qui a fait perdre l'optimisation statique de `/login` et
  autres pages publiques — corrigé.
- ✅ **Pages d'erreur brandées** (`app/error.tsx`, `app/not-found.tsx`) — le
  404/500 générique de Next.js s'affichait auparavant, hors design, sans
  navigation.
- 🟡 **4 correctifs d'accessibilité critiques sur 11 trouvés** : boutons
  icône-seule sans nom accessible, `aria-live`/`role="log"` sur les chats
  temps réel, focus clavier sur le bouton "Signaler", erreurs de formulaire
  annoncées. Reste : contrastes, lien d'évitement, défilement des onglets.
- ✅ **Curseur de pagination messagerie/salles scopé** — un id de message
  d'une autre conversation/salle pouvait servir de curseur de pagination.

**Reste dans le backlog** (voir `AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md`
section 6) : rate limiting/anti-brute-force, gate de tier sur l'achat de
crédits, remboursement de crédit Deal Room (contact refusé/expiré),
annulation d'inscription événement, réédition d'opportunité refusée,
validation Zod sur ~7 fichiers d'actions, contrastes de couleur, contenu
juridique définitif des pages CGU/confidentialité.

## Prochaines étapes (voir BACKLOG_DEV.md)

- EX : suite du sprint sécurité/conformité (rate limiting, gates de tier
  restants, remboursements Deal Room, contrastes)
- E9-T04 (push notifications) si l'infra VAPID/push devient une priorité produit
