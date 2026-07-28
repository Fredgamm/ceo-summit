# CEO Summit Platform — App

Plateforme B2B CEO Summit : membership, événements, Deal Room, salles thématiques, messagerie.
Stack : Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Prisma · PostgreSQL · Redis · NextAuth v5.

Voir `/BACKLOG_DEV.md` (racine du projet) pour la liste complète des tâches par epic.

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
npm run db:seed        # crée admin@ceosummit.mg / ChangeMe123! et demo@ceosummit.mg / Demo1234!

# 5. Lancer le serveur de dev
npm run dev
```

⚠️ **Ce dossier n'est pas encore un dépôt git.** Avant de committer quoi que ce soit,
lancer `git init` à la racine du projet (`B2B plateforme/`), puis `npm install` pour que
Husky active réellement le hook pre-commit (`.husky/pre-commit` existe déjà mais reste
inactif sans `.git`).

Ouvrir http://localhost:3000 → redirige vers `/login`.

## Comptes de test (après seed)

| Rôle                | Email              | Mot de passe |
| ------------------- | ------------------ | ------------ |
| Admin (Super Admin) | admin@ceosummit.mg | ChangeMe123! |
| Membre (Chairman)   | demo@ceosummit.mg  | Demo1234!    |

**Changer ces mots de passe avant tout déploiement staging/prod.**

## Structure

```
app/                    App Router — pages, layouts, route handlers
  (member routes)       /dashboard, /deal-room, /evenements, /catalogue, /salles, /messagerie, /profil, /entreprise
  admin/                Backoffice — protégé par middleware (role === ADMIN)
  api/                  Route handlers (auth, webhooks Evolia/Zoom/Resend)
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

Couverture actuelle (59 tests) : webhook Evolia, actions d'auth (activation, mot de passe
oublié, onboarding, profil), logique de requête catalogue/événements (`lib/catalogue.ts`,
`lib/events-query.ts`), lock Redis de capacité (`lib/event-registration-lock.ts`) et
inscription événement (`app/actions/events.ts`). Les pages elles-mêmes (composants React)
n'ont pas de tests de rendu — seule la logique serveur/pure est testée pour l'instant.

## Note environnement de build

`@prisma/client` nécessite un accès réseau à `binaries.prisma.sh` pour télécharger le moteur —
si votre environnement CI/sandbox bloque ce domaine, `prisma generate` échouera avec une 403.
Ce n'est pas un problème de code ; ça fonctionne normalement en local et sur CI standard
(GitHub Actions, Vercel, etc.).

## État d'avancement (E0 / E1)

- ✅ E1-T01 : NextAuth + middleware RBAC (mur grossier — les vérifications fines de tier
  se font page par page à mesure qu'elles existent)
- ✅ E1-T02 : Webhook Evolia (`/api/webhooks/evolia`) — idempotent sur `paymentRef`, testé (Vitest)
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
- ❌ PWA : `public/icons/*.png` sont des placeholders générés (navy/gold, sans logo réel)
  — swap prévu en E9-T01 ; pas de `next-pwa`/service worker configuré encore

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

## Prochaines étapes (voir BACKLOG_DEV.md)

- E3-T04/T05 pour clore E3
- E4 → E9 : Deal Room, salles temps réel, messagerie, reste du backoffice, PWA
