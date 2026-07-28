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

À date, la couverture porte sur `app/api/webhooks/evolia/route.ts` (signature invalide,
payload malformé, création de compte, renouvellement, idempotence sur `paymentRef`
en doublon). Les routes/actions restantes n'ont pas encore de tests — à compléter au
fil d'E1/E2 (voir critère d'acceptation EX-T02 dans `BACKLOG_DEV.md`).

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

## Prochaines étapes (voir BACKLOG_DEV.md)

- E3 → E9 : événements, Deal Room, salles temps réel, messagerie, backoffice complet, PWA
