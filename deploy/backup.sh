#!/bin/bash
# Nightly backup — Postgres dump + uploaded files (.local-storage, the
# interim disk-based fallback in lib/r2.ts while R2 isn't configured — see
# DEPLOY.md). Installed as a systemd timer on the VPS (see
# deploy/ceo-summit-backup.service / .timer), not cron — this Debian
# install doesn't have the cron package, and certbot's own renewal already
# uses a systemd timer here, so this stays consistent with that.
#
# Limitation: backups land on the same disk as the data they protect
# (/opt/ceo-summit/backups, on this VPS's ceo-summit partition) — this
# guards against accidental deletion, a bad `docker compose` command, or an
# application bug, but NOT against the physical disk failing. For that,
# use an OVH snapshot/backup of the whole VPS (configured from the OVH
# manager, not from here).
set -euo pipefail

# 14 oct. 2026 — dossier de l'instance déduit de l'emplacement du script
# (/opt/ceo-summit = préprod, /opt/ceo-summit-prod = prod).
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
RETENTION_DAYS=14
DATE=$(date +%Y%m%d-%H%M%S)

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

POSTGRES_USER=$(grep '^POSTGRES_USER=' .env | cut -d'"' -f2)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" ceo_summit | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"

tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz" -C "$PROJECT_DIR" .local-storage

find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete
