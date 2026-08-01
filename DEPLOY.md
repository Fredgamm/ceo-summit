# Déploiement — VPS OVH (Debian)

> VPS : `vps-283e97d0.vps.ovh.ca` · IPv4 `167.114.96.153` · utilisateur `debian`
> Déploiement **HTTP sur l'IP** pour l'instant (pas de domaine pointé) — voir
> la section 8 pour migrer vers HTTPS plus tard sans tout refaire.

## 0. Vue d'ensemble

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
`DATABASE_URL`). `NEXTAUTH_URL` et `NEXT_PUBLIC_SOCKET_URL` sont déjà
pré-remplis avec `http://167.114.96.153` dans le modèle — laisse tel quel
pour l'instant (IP seule, pas de domaine).

Les identifiants Resend/R2/Zoom/Evolia sont optionnels pour un premier
déploiement de test — sans eux, les emails et uploads de fichiers
échoueront proprement (comportement déjà documenté dans le projet pour
l'environnement de dev), mais le reste de la plateforme fonctionne.

## 6. Construire et démarrer

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

## 7. Charger les données de démonstration (optionnel)

Pour avoir un compte admin (`admin@ceosummit.mg` / `ChangeMe123!`) et des
données de démo, comme en local :

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

**Change le mot de passe admin par défaut immédiatement après**, ou
saute carrément le seed et crée un compte réel via `/demande-acces` +
approbation manuelle en base si tu préfères partir d'une base vide.

## 8. Vérifier

```bash
curl -I http://167.114.96.153/login
```

Tu dois voir `HTTP/1.1 200` et les en-têtes de sécurité (`X-Frame-Options`,
`Content-Security-Policy`, etc. — voir `AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md`).
Ouvre `http://167.114.96.153/login` dans un navigateur pour te connecter.

**Note HSTS** : le header `Strict-Transport-Security` est envoyé mais les
navigateurs l'ignorent tant que la connexion n'est pas déjà en HTTPS — donc
pas de souci à le laisser en place tant que c'est du HTTP pur.

## 9. Passer en HTTPS plus tard (une fois un domaine pointé ici)

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

## 11. Sauvegardes Postgres

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U ceosummit ceo_summit > backup-$(date +%Y%m%d).sql
```

À automatiser via un cron sur le VPS une fois le déploiement stabilisé —
aucune sauvegarde automatique n'est configurée par défaut.

## 12. CI/CD (déploiement automatique)

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

| Nom           | Valeur                                                         |
| ------------- | -------------------------------------------------------------- |
| `VPS_HOST`    | `167.114.96.153`                                               |
| `VPS_USER`    | `debian`                                                       |
| `VPS_SSH_KEY` | contenu complet de `ceo-summit-deploy-key` (la clé **privée**) |

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
upload preuve → validation admin), sans passer par Evolia. La route
webhook (`app/api/webhooks/evolia/route.ts`) **reste en place et
fonctionnelle** — aucune donnée historique n'est touchée — mais n'est
plus le chemin recommandé pour un nouveau paiement.

Pour couper Evolia proprement une fois le nouveau parcours validé en
production : **arrêter de pointer Evolia vers cette URL de webhook**
côté configuration Evolia elle-même — aucun changement de code n'est
nécessaire ici. La route continue de répondre (idempotence testée)
si un appel tardif arrive malgré tout.

## Limites connues de ce déploiement

- **CI/CD en place** (`E0-T04`) mais nécessite la configuration manuelle
  ponctuelle de la section 12 (clé SSH + secrets GitHub) pour être actif.
- **Pas de sauvegarde automatique** — voir section 11.
- **Rate limiting toujours absent** (`EX-T01`, voir l'audit sécurité) — à
  garder en tête avant une exposition publique large.
- **Emails/uploads de fichiers inertes tant que Resend/R2 ne sont pas
  configurés** dans `.env` — comportement déjà documenté pour
  l'environnement de dev, identique ici.
