# Déploiement — VPS OVH (Debian)

> **Serveur de production actuel (vérifié le 13 octobre 2026)**
>
> - VPS OVH `vps-cb631c3c.vps.ovh.net` · IPv4 `57.128.183.148` · Debian 12 (bookworm)
> - Connexion : `ssh b2b-plateforme-prod` (alias de `~/.ssh/config`, utilisateur `root`)
> - Projet dans `/opt/ceo-summit` ; conteneurs `ceo-summit-app-1`, `ceo-summit-socket-1`,
>   `ceo-summit-postgres-1`, `ceo-summit-redis-1`
> - **En production sur `https://app.ceo-summit.mg`** (HTTPS, certificat géré par le
>   nginx **de l'hôte**, VPS partagé avec d'autres projets), déployé par GitHub
>   Actions depuis `mvp-connect-simple` (section 12).
>
> **Historique :** le tout premier déploiement de test tournait sur
> `vps-283e97d0.vps.ovh.ca` (`167.114.96.153`, utilisateur `debian`). Les sections
> ci-dessous qui citent cette IP, l'utilisateur `debian`, « HTTP sur l'IP » ou un
> conteneur `nginx` décrivent cette installation initiale : les commandes restent
> valables en remplaçant l'hôte par `b2b-plateforme-prod`. Voir section 9 pour
> l'état réel du reverse proxy.

## 0. Vue d'ensemble

> **État actuel (25 septembre 2026) :** plus de conteneur `nginx` —
> `docker-compose.prod.yml` publie `app` et `socket` sur `127.0.0.1:3020` et
> `127.0.0.1:3021`, et c'est le nginx de l'hôte (vhost
> `/etc/nginx/conf.d/ceo-summit.conf`, TLS pour `app.ceo-summit.mg`) qui fait
> le reverse proxy. Le paragraphe ci-dessous décrit la version initiale.

Docker Compose fait tourner 5 conteneurs : `postgres`, `redis`, `app` (le
site Next.js), `socket` (le serveur Socket.io autonome des salles/messagerie
temps réel), `nginx` (reverse proxy, seul point d'entrée public). Postgres et
Redis ne sont **jamais exposés publiquement** — seul Nginx écoute sur le port
80 externe.

**Pourquoi ce découpage** : `app` et `socket` tournent séparément parce que
c'est déjà l'architecture du projet en local (`npm run dev` + `npm run
socket:dev`, voir README.md) — Socket.io n'est pas un custom server Next.js.
Nginx route `/socket.io/*` vers `socket` et tout le reste vers `app`, sur la
même origine publique : le client socket.io (`lib/socket-client.ts`) se
connecte par défaut au chemin `/socket.io/`, donc ce découpage ne demande
**aucune modification de code**, juste la bonne config Nginx (déjà fournie,
`deploy/nginx.conf`).

---

## 1. Première connexion et mise à jour du système

```bash
ssh debian@167.114.96.153
sudo apt update && sudo apt upgrade -y
```

## 2. Installer Docker + le plugin Compose

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Utiliser docker sans sudo (déconnecte/reconnecte-toi après ça, ou lance `newgrp docker`)
sudo usermod -aG docker debian
newgrp docker

docker --version
docker compose version
```

**Sur le VPS partagé actuel (app.ceo-summit.mg)** : ce serveur héberge aussi
Healthy AI, sur sa propre partition (`/`, ~45 Go). Docker stocke ses données
(images, conteneurs, volumes) dans `/var/lib/docker` par défaut — sur `/`,
donc sur le disque de Healthy AI, pas sur la partition dédiée CEO Summit.
Après plusieurs rebuilds ça a fini par saturer `/` (images/build cache non
nettoyés) et fait planter Healthy AI aussi bien que CEO Summit. Corrigé en
déplaçant le `data-root` de Docker vers `/opt/docker-data` (sur la partition
dédiée) via `/etc/docker/daemon.json` :

```json
{ "data-root": "/opt/docker-data" }
```

Penser aussi à nettoyer régulièrement (`docker image prune -af` après
chaque déploiement) — le déplacement limite les dégâts en cas d'oubli
(la partition dédiée déborde sans toucher à Healthy AI), mais ne remplace
pas un nettoyage périodique.

> 23 septembre 2026 — initialement placé dans `/opt/ceo-summit/.docker-data`
> (à l'intérieur même du dépôt), ce qui en faisait malgré lui une entrée du
> contexte de build Docker (`context: .` dans `docker-compose.prod.yml`) et
> causait des échecs intermittents de build ("checking context: can't stat")
> quand `docker system prune -af` modifiait ce dossier pendant que le
> builder classique le parcourait. D'où le déplacement vers `/opt/docker-data`
> (dossier voisin, hors du dépôt, toujours sur la partition dédiée) — voir
> `.github/workflows/ci-cd.yml`, étape "Relocate Docker data-root out of
> the build context", qui a effectué cette migration en production.

## 3. Pare-feu (UFW)

Seuls SSH (22) et HTTP (80) doivent être accessibles depuis l'extérieur —
Postgres/Redis/l'app/le socket ne sont volontairement joignables que via le
réseau interne Docker ou `127.0.0.1` (cohérent avec l'audit sécurité du
projet, voir `AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md`).

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp   # à activer une fois un domaine + certificat en place (section 8)
sudo ufw enable
sudo ufw status
```

## 4. Cloner le dépôt

```bash
sudo mkdir -p /opt/ceo-summit
sudo chown debian:debian /opt/ceo-summit
git clone https://github.com/Fredgamm/ceo-summit.git /opt/ceo-summit
cd /opt/ceo-summit
```

Si le dépôt est privé, il faudra soit une clé SSH GitHub déployée sur le VPS
(`ssh-keygen`, ajouter la clé publique dans GitHub → Settings → Deploy keys),
soit cloner via un Personal Access Token.

## 5. Configurer les secrets (`.env`)

**Ce fichier ne doit jamais être committé** (il est déjà dans `.gitignore`).
Copier le modèle et le remplir — **bien vers `.env`, pas `.env.production`** :
Docker Compose lit automatiquement un fichier nommé exactement `.env` dans
le dossier du projet (substitution `${VAR}` + injection dans les
conteneurs via `env_file: .env`) ; avec un autre nom il faudrait ajouter
`--env-file ...` à chaque commande, ce qui a été testé et s'oublie
facilement.

```bash
cp .env.production.example .env
nano .env   # ou vim
```

Générer les 3 secrets requis directement sur le VPS :

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32
# MESSAGE_ENCRYPTION_KEY
openssl rand -hex 32
# POSTGRES_PASSWORD — n'importe quel mot de passe fort, par ex :
openssl rand -base64 24
```

Colle ces 3 valeurs dans `.env` (`NEXTAUTH_SECRET`,
`MESSAGE_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` **et** la même valeur dans
`DATABASE_URL`). `NEXTAUTH_URL` et `NEXT_PUBLIC_SOCKET_URL` doivent valoir
`https://app.ceo-summit.mg` (déjà le cas dans le modèle depuis le
25 septembre 2026).

Les identifiants R2/Zoom/webhook paiement sont optionnels pour un premier
déploiement de test. **Le SMTP, lui, est indispensable en production** :
sans lui, aucun email (activation, invitation, mot de passe oublié…) ne part
— l'échec est journalisé (`[email] SMTP non configuré — email non envoyé à …`)
mais l'utilisateur ne reçoit rien. Voir section 8 bis.

## 6. Construire et démarrer

Les conteneurs `app`/`socket` tournent en utilisateur non-root `node`
(uid 1000, voir `Dockerfile`) : le dossier hôte des uploads, monté dans
`app` (`./.local-storage`, voir `docker-compose.prod.yml`), doit donc lui
appartenir — sinon Docker le crée en root au premier `up` et tout upload
échoue en `EACCES` :

```bash
mkdir -p .local-storage
sudo chown -R 1000:1000 .local-storage
```

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Ça va prendre quelques minutes la première fois (build Next.js). Suivre les
logs :

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Le conteneur `app` lance automatiquement `prisma migrate deploy` avant de
démarrer (voir `docker-compose.prod.yml`) — les migrations s'appliquent
seules, pas besoin de les lancer à la main.

## 7. Données de démonstration — jamais en production

Le seed crée `admin@ceo-summit.mg` / `ChangeMe123!` et `demo@ceo-summit.mg` /
`Demo1234!` (mots de passe publics, écrits dans le README) ainsi que des
évènements, opportunités et salles fictifs. Il refuse donc de tourner quand
`NODE_ENV=production`. Pour une base de recette jetable uniquement :

```bash
docker compose -f docker-compose.prod.yml exec -e ALLOW_PRODUCTION_SEED=true app npm run db:seed
```

En production, créer le premier compte administrateur à la main avec un mot
de passe fort, puis les offres depuis `/admin/plans`.

## 8. Vérifier

```bash
curl -I https://app.ceo-summit.mg/login
```

Tu dois voir un statut `200` et les en-têtes de sécurité (`X-Frame-Options`,
`Content-Security-Policy`, `Strict-Transport-Security`, etc. — voir
`AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md`). Ouvre
`https://app.ceo-summit.mg/login` dans un navigateur pour te connecter.

## 8 bis. Vérifier l'envoi d'emails en prod

En production, l'application **ne se replie plus sur Maildev** (qui n'existe
pas sur le serveur) : sans SMTP configuré, chaque envoi échoue avec une
erreur explicite dans les logs au lieu de disparaître en silence.

1. Renseigner dans `/opt/ceo-summit/.env` les identifiants de la boîte mail
   de ceo-summit.mg :
   ```
   SMTP_HOST="…"          # pas le placeholder smtp.exemple.mg
   SMTP_PORT="465"        # 465 = TLS implicite ; 587 = STARTTLS
   SMTP_USER="noreply@ceo-summit.mg"
   SMTP_PASSWORD="…"
   EMAIL_FROM="noreply@ceo-summit.mg"   # vide = SMTP_USER utilisé comme expéditeur
   ```
   Ne pas définir `MAIL_DEV_MODE` en production.
2. Redémarrer l'application pour qu'elle relise `.env` :
   ```bash
   cd /opt/ceo-summit
   docker compose -f docker-compose.prod.yml up -d app
   ```
3. Dans `/admin/parametres`, onglet **Intégrations** : le SMTP doit
   apparaître « Connecté ».
4. Test réel : « Mot de passe oublié » sur `/login` avec une adresse que tu
   consultes, ou l'envoi test d'une campagne. En cas d'échec :
   ```bash
   docker compose -f docker-compose.prod.yml logs app | grep -i "\[email\]\|\[mail\]"
   ```

## 9. HTTPS — en place

**Fait** : le site est servi en HTTPS sur `https://app.ceo-summit.mg`. Le
certificat et la terminaison TLS sont gérés par le nginx de l'hôte (vhost
`/etc/nginx/conf.d/ceo-summit.conf`, reverse proxy vers `127.0.0.1:3020`
pour l'app et `127.0.0.1:3021` pour `/socket.io/`), pas par un conteneur.
Renouvellement : `sudo certbot renew --dry-run` pour vérifier que le
renouvellement automatique de l'hôte couvre bien ce domaine.

_Procédure d'origine, conservée pour mémoire (conteneur nginx dédié) :_

1. Chez ton registrar, crée un enregistrement DNS `A` pointant vers
   `167.114.96.153` (et idéalement un `AAAA` vers
   `2607:5300:205:200::7eb2`).
2. Une fois propagé (`dig ton-domaine.tld` doit répondre `167.114.96.153`) :
   ```bash
   sudo apt install -y certbot
   sudo docker compose -f docker-compose.prod.yml stop nginx
   sudo certbot certonly --standalone -d ton-domaine.tld
   ```
3. Adapter `deploy/nginx.conf` : ajouter un bloc `listen 443 ssl;` avec
   `ssl_certificate`/`ssl_certificate_key` pointant vers
   `/etc/letsencrypt/live/ton-domaine.tld/`, monter ce dossier en volume
   dans `docker-compose.prod.yml` (`- /etc/letsencrypt:/etc/letsencrypt:ro`
   sur le service `nginx`), et décommenter le port `443:443`.
4. Mettre à jour `NEXTAUTH_URL` et `NEXT_PUBLIC_SOCKET_URL` dans `.env`
   vers `https://ton-domaine.tld`, puis
   `docker compose -f docker-compose.prod.yml up -d --build`.
5. Renouvellement automatique : `sudo certbot renew --dry-run` pour tester,
   puis un cron/systemd timer (certbot en installe généralement un tout seul).

## 10. Mises à jour ultérieures

```bash
cd /opt/ceo-summit
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

**Une seule fois, avant le premier déploiement de l'image non-root (audit
du 25 septembre 2026)** — `.local-storage` a été rempli jusqu'ici par un
conteneur root : ses fichiers/dossiers appartiennent à root et l'utilisateur
`node` (uid 1000) du nouveau conteneur ne pourrait plus y écrire. À lancer
_avant_ que la CI ne déploie cette version (ou juste avant le `up -d
--build` manuel) :

```bash
cd /opt/ceo-summit
sudo chown -R 1000:1000 .local-storage
# sans sudo (l'utilisateur est dans le groupe docker) :
# docker run --rm -v "$PWD/.local-storage:/d" alpine chown -R 1000:1000 /d
```

## 11. Sauvegardes — Postgres + fichiers uploadés

Automatisées via `deploy/backup.sh` (dump Postgres + tar de
`.local-storage`, le repli disque de `lib/r2.ts` tant que R2 n'est pas
configuré), déclenché chaque nuit à 3h30 par un
timer systemd — **pas de cron** : ce Debian ne l'a pas installé, et
certbot utilise déjà un timer systemd pour son propre renouvellement sur
ce VPS, donc on reste cohérent avec ça.

Installation (une seule fois) :

```bash
chmod +x deploy/backup.sh
cp deploy/ceo-summit-backup.service deploy/ceo-summit-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ceo-summit-backup.timer
```

Vérifier / lancer manuellement :

```bash
systemctl list-timers ceo-summit-backup.timer
systemctl start ceo-summit-backup.service   # lance une sauvegarde tout de suite
ls -la backups/
```

Rétention : 14 jours glissants, purge automatique dans le script.

**Le service lance le script via `/bin/bash`** (`ExecStart=/bin/bash
/opt/ceo-summit/deploy/backup.sh`), pas directement. Ainsi, le bit
d'exécution du fichier ne compte pas.

> **Incident du 14 septembre au 13 octobre 2026 — aucune sauvegarde pendant un mois.**
>
> - **Cause.** `backup.sh` était enregistré dans git sans bit d'exécution
>   (`100644`). Une mise à jour du dépôt sur le VPS, le 14 septembre, l'a réécrit
>   en `-rw-r--r--`. Depuis, chaque nuit, systemd échouait avec
>   `status=203/EXEC` (« Permission denied »), sans alerte.
> - **Corrigé le 13 octobre :**
>   - `chmod +x` sur le serveur ;
>   - `ExecStart` passé par `/bin/bash` ;
>   - copie de l'ancien fichier de service en `.bak-2026-10-13` ;
>   - sauvegarde immédiate vérifiée ;
>   - bit d'exécution enregistré dans git (`100755`).
> - **Perte.** Les sauvegardes du 11 au 14 septembre ont été purgées par la
>   rétention de 14 jours lors de la relance.

**Contrôle après chaque déploiement**, ou au moins une fois par semaine :

```bash
ssh b2b-plateforme-prod
systemctl show ceo-summit-backup.service -p Result -p ExecMainStatus   # attendu : success / 0
ls -lt /opt/ceo-summit/backups | head -3                               # fichiers de la nuit
zcat /opt/ceo-summit/backups/db-<date>.sql.gz | grep -c "database dump complete"   # attendu : 1
```

**Limite connue** : les sauvegardes atterrissent sur le même disque que les
données qu'elles protègent (`/opt/ceo-summit/backups`, partition dédiée
CEO Summit sur ce VPS) — ça protège contre une suppression accidentelle ou
une commande Docker malheureuse, **pas** contre une panne physique du
disque. Pour ça, activer un snapshot/sauvegarde OVH du VPS entier depuis le
manager OVH (hors de portée de ce dépôt).

## 12. CI/CD (déploiement automatique)

> **Mise à jour du 9 octobre 2026.** La branche déployée est
> `mvp-connect-simple`, et l'image n'est plus compilée sur le VPS :
>
> - le job `image` compile l'image Docker dans GitHub Actions et la publie
>   sur GHCR (`ghcr.io/fredgamm/ceo-summit:<commit>` et `:latest`) ;
> - le job `deploy` se connecte au VPS, met à jour le dépôt (pour
>   `docker-compose.prod.yml`), télécharge l'image (`docker compose pull`)
>   et redémarre les conteneurs (`up -d --no-build`) ;
> - le site tourne en plusieurs processus Next.js (`server/web-cluster.js`) ;
>   leur nombre se règle avec `WEB_CONCURRENCY` dans `/opt/ceo-summit/.env`
>   (2 par défaut, chaque processus consommant 150 à 400 Mo de mémoire).
>
> **Secours** si GHCR est indisponible : sur le VPS,
> `docker compose -f docker-compose.prod.yml up -d --build` recompile sur
> place, comme avant.

Depuis `.github/workflows/ci-cd.yml`, chaque push sur `main` déclenche : un
job `ci` (lint, type-check, tests, migrations sur une base Postgres
éphémère fraîche, build), puis — seulement si `ci` réussit — un job
`deploy` qui se connecte en SSH au VPS et relance la stack.

Deux choses à faire une seule fois pour activer ça :

### 12.1 Générer une clé SSH dédiée au déploiement

Ne pas réutiliser ta clé SSH personnelle. Sur ta machine (pas sur le VPS) :

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./ceo-summit-deploy-key -N ""
```

Ça crée deux fichiers : `ceo-summit-deploy-key` (privée) et
`ceo-summit-deploy-key.pub` (publique).

### 12.2 Autoriser la clé publique sur le VPS

```bash
ssh debian@167.114.96.153 \
  "echo '$(cat ceo-summit-deploy-key.pub)' >> ~/.ssh/authorized_keys"
```

Vérifie que ça fonctionne avant de continuer :

```bash
ssh -i ceo-summit-deploy-key debian@167.114.96.153 "echo ok"
```

### 12.3 Ajouter les secrets sur GitHub

Dans le dépôt GitHub → **Settings → Secrets and variables → Actions → New
repository secret**, ajouter les 3 secrets suivants :

| Nom           | Valeur                                                           |
| ------------- | ---------------------------------------------------------------- |
| `VPS_HOST`    | `57.128.183.148` (serveur actuel ; `167.114.96.153` à l'origine) |
| `VPS_USER`    | utilisateur SSH autorisé pour la clé de déploiement              |
| `VPS_SSH_KEY` | contenu complet de `ceo-summit-deploy-key` (la clé **privée**)   |

Une fois fait, **supprime la clé privée de ta machine locale**
(`rm ceo-summit-deploy-key ceo-summit-deploy-key.pub`) — elle est en
sécurité dans les secrets GitHub chiffrés, inutile de la garder en clair
ailleurs.

Après ça, tout push sur `main` qui passe le job `ci` redéploie
automatiquement — la mise à jour manuelle de la section 10 reste possible
mais n'est plus nécessaire au quotidien.

## 13. Commandes utiles

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f socket
docker compose -f docker-compose.prod.yml logs -f nginx

# Redémarrer un service
docker compose -f docker-compose.prod.yml restart app

# Tout arrêter
docker compose -f docker-compose.prod.yml down

# État des conteneurs
docker compose -f docker-compose.prod.yml ps
```

## Bascule Evolia → paiement in-app (Phase 2 offres/paiement, 30 juillet 2026)

Depuis la Phase 2, l'adhésion peut être payée directement dans la
plateforme (création d'entreprise → invitation → choix d'offre →
upload preuve → validation admin), sans passer par un prestataire
externe. La route webhook `app/api/webhooks/evolia/route.ts`
mentionnée dans une version antérieure de ce document **a été retirée
pendant la purge Phase 3** (adhésions individuelles) — elle n'existe
plus dans le code, contrairement à ce qui était affirmé ici.

**Remplacement (7 août 2026)** : un webhook de confirmation générique
et agnostique du prestataire, `app/api/webhooks/payments/route.ts`
(voir `lib/payment-confirmations.ts` et `lib/validations/webhooks.ts`).
Aucun prestataire n'est branché à ce stade. Il coexiste avec la
validation manuelle admin (`confirmCompanyPayment`/
`confirmEventPayment`/`confirmCreditPurchase`), qui reste le chemin
principal et n'est jamais remplacée — le webhook n'est qu'un chemin de
confirmation automatique en plus, pour un prestataire qui l'offrirait.
Secret HMAC : `PAYMENT_WEBHOOK_SECRET` (voir `.env.example`).

## Limites connues de ce déploiement

- **CI/CD en place** (`E0-T04`) mais nécessite la configuration manuelle
  ponctuelle de la section 12 (clé SSH + secrets GitHub) pour être actif.
- **Sauvegardes sur le même disque que les données** : base et fichiers
  téléversés, chaque nuit, gardés 14 jours (section 11). Aucune copie hors
  du serveur ni snapshot OVH à ce jour.
- **Rate limiting** : en place sur les points sensibles (connexion,
  webhooks — 60 requêtes/min/IP sur `/api/webhooks/payments`, etc.), adossé
  à Redis.
- **Emails en échec tant que le SMTP n'est pas configuré** dans `.env`
  (erreur explicite dans les logs, voir section 8 bis) ; uploads de fichiers
  sur disque local tant que R2 n'est pas configuré.
