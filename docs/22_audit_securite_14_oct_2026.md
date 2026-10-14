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

## Revue complémentaire : infrastructure, CI et test dynamique (14 oct.)

Faite en lecture seule sur le VPS et contre les deux sites (tests non
destructifs).

**Sain** : Debian 12 à jour (`unattended-upgrades` actif, aucune mise à jour
de sécurité en attente) ; TLS 1.2/1.3 seulement, suites modernes, HSTS
preload ; `server_tokens off` ; conteneurs applicatifs en utilisateur `node`,
non privilégiés, ports publiés sur 127.0.0.1 seulement (Postgres/Redis des
deux instances jamais publiés) ; `.env` en 600 ; fichiers sensibles du dépôt,
`.git`, cartes de sources, API et fichiers déposés inaccessibles sans
session ; traversée de chemin bloquée ; webhooks non signés refusés (401) ;
`callbackUrl` externe ignoré.

**Corrigé sur le VPS (14 oct., après accord)** : SSH par clé uniquement
(`/etc/ssh/sshd_config.d/00-hardening.conf`, lu avant `50-cloud-init.conf`
qui réactivait les mots de passe), X11 coupé, `MaxAuthTries 3` ; fail2ban
(jails `sshd` + `recidive`, journal systemd) ; LLMNR/mDNS coupés (port 5355).
Ports de la prod déplacés de 3030/3031 vers **3040/3041** : 3030 est appelé
par le module RTMP de nginx (`on_publish`/`on_done`) pour le streaming de
l'autre projet.

**Corrigé** : sauvegardes et fichiers déposés lisibles par tout compte du
serveur → 700/600, `umask 077` dans `deploy/backup.sh` ;
`appleboy/ssh-action` (reçoit la clé SSH du VPS) épinglé sur son commit.

**À décider (serveur partagé avec d'autres projets)** :

- **Pare-feu** : aucun (politique INPUT ACCEPT). À poser une fois connus
  les besoins des autres projets.
- Ports publics d'autres projets : **8001** (`/home/debian/mcp-healthy`,
  « Healthy MCP », FastAPI + Claude, servi aussi par nginx sous
  api.viesaine.ovh ; documentation `/docs` et `/status/*` ouverts sans
  authentification, `.env` en 644) → le lier à 127.0.0.1 ; **1935** (RTMP,
  publication contrôlée par `on_publish`).
- Postgres : l'application se connecte en **superutilisateur** (rôle par
  défaut de l'image) → créer un rôle propriétaire sans superutilisateur.
- **R2 non configuré** : fichiers déposés (preuves de paiement…) sur le
  disque du VPS, comme les sauvegardes → une panne disque perd les deux.
  Configurer R2 et/ou les sauvegardes OVH du VPS.
- Redis sans mot de passe : acceptable (réseau Docker interne uniquement).
- Le compte de déploiement `debian` est dans le groupe `docker`
  (équivalent root) : à garder en tête pour la clé SSH de la CI.

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
