# Audit de sécurité du 14 octobre 2026 — suites données

Audit statique (white-box) du dépôt reçu le 14 octobre 2026. Chaque constat a
été revérifié contre le code et les serveurs avant correction : plusieurs
points étaient déjà traités par les audits précédents (25 septembre, 7 août).

## Bilan

| #   | Constat de l'audit                                | État réel avant                                                                                                                                                | Suite                              |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| H1  | Session JWT 24 h non révocable                    | Partiel : actions serveur et envois vérifiaient déjà statut et changement de mot de passe (`requireViewer`), pas les pages                                     | **Corrigé**                        |
| H2  | Pas de limitation sur login / reset / inscription | **Déjà en place** : login par IP et par email, reset, inscription, envois, webhook (`lib/rate-limit.ts`, Redis)                                                | —                                  |
| H3  | Dépendances vulnérables                           | Optimiseur d'images **déjà désactivé** (`images.unoptimized`, `/_next/image` → 404 vérifié sur les deux sites) : les 2 critiques Next ne sont pas exploitables | **Partiel** — voir ci-dessous      |
| M1  | CSP en `unsafe-inline`                            | Inchangé                                                                                                                                                       | **Reporté** à la migration Next 15 |
| M2  | Énumération de comptes                            | Login : **déjà** temps égalisé (hash factice) et statut révélé seulement au titulaire. Inscription : message « compte existant »                               | **Risque accepté** (inscription)   |
| M3  | Type MIME des envois = en-tête du client          | Images de profil/logo/galerie déjà ré-encodées par sharp                                                                                                       | **Corrigé**                        |
| L1  | `jwt.verify` sans algorithme imposé               | —                                                                                                                                                              | **Corrigé**                        |
| L2  | Limite de messages par connexion                  | —                                                                                                                                                              | **Corrigé**                        |
| —   | `trustHost` : Host arbitraire accepté             | **Constaté** : nginx servait b2b.ceo-summit.mg pour n'importe quel domaine                                                                                     | **Corrigé** (serveur)              |

## Corrections

**H1 — sessions.** Le callback `jwt` d'`auth.ts` relit le compte en base à
chaque `auth()` côté serveur (`refreshSessionToken`) : compte suspendu,
exclu, supprimé ou mot de passe changé depuis la connexion → session nulle ;
rôle, droits admin et accès entreprise viennent de la base, plus du jeton.
La règle est partagée avec `requireViewer` (`lib/session-validity.ts`). Le
middleware edge ne renvoie plus `/login` vers `/dashboard` (sinon boucle avec
un jeton encore valide mais refusé en base) : c'est la page `/login` qui le
fait, d'après la session vérifiée.

**H3 — dépendances.** sharp 0.35.5 et source-map-js corrigés (lockfile npm 10).
Restent, faute de correctif sans version majeure :

- **Next.js** : la ligne 14 n'est plus corrigée (correctifs à partir de
  15.5.24). Les failles encore pertinentes (DoS Server Actions/RSC, SSRF
  Server Actions sur serveur personnalisé) demandent la **migration vers
  Next 15** (React 19, API de requête asynchrones). À planifier.
- nodemailer < 10.0.6 : bloqué par la dépendance pair de NextAuth (7 ou 8).
  Exposition faible : un seul transport, destinataires validés, options
  `raw`/fichiers non utilisées.
- Tailwind, PostCSS, braces, micromatch : outils de compilation, non exposés
  à l'exécution. react-email/prismjs : rendu serveur des e-mails, sans DOM.

**M3 — envois.** `lib/file-signature.ts` identifie le type par les premiers
octets (PDF, JPEG, PNG, WebP, GIF) ; c'est ce type qui est vérifié et stocké
pour les pièces jointes Deal Room et salles, les preuves de paiement et les
pièces jointes des broadcasts. `Content-Disposition: attachment` non imposé :
l'aperçu PDF des preuves de paiement (iframe) en dépend, et le contenu est
désormais vérifié.

**L1 / L2 — temps réel.** `jwt.verify(..., { algorithms: ["HS256"] })` ;
délai entre deux messages compté par membre (toutes connexions), en mémoire
du conteneur `socket` unique.

**Host arbitraire.** `/etc/nginx/conf.d/00-default-deny.conf` sur le VPS :
`default_server` en 80/443 qui refuse tout domaine inconnu
(`ssl_reject_handshake`, `return 444`). Vérifié : domaine inconnu refusé,
b2b/app/www.b2b et les sites viesaine inchangés.

## Reste à faire

1. **Migration Next 15.5+** — corrige la majorité des avis Next restants ;
   y faire **M1** (CSP à nonces, sans `unsafe-inline` en `script-src`) : les
   nonces sous Next 14 sont eux-mêmes concernés par un avis XSS
   (GHSA-ffhc-5mcf-pf4q).
2. **M2 inscription** : seul un parcours avec vérification d'e-mail avant
   paiement rendrait le message neutre (le checkout connecte le gestionnaire
   juste après la création). Risque borné par la limite de 5 inscriptions /
   heure / IP. À rediscuter si l'abus devient réel.
3. Hors périmètre de l'audit, recommandé : test dynamique (DAST), revue
   PostgreSQL/Redis/Docker et des secrets CI.
