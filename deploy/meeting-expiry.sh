#!/bin/bash
# Expiration des demandes de rendez-vous B2B sans réponse (module 21, lot 6).
# Appelée toutes les 5 minutes par un timer systemd (deploy/ceo-summit*-meeting-expiry.*),
# comme les sauvegardes — pas de cron sur ce Debian.
#
# Dossier de l'instance déduit de l'emplacement du script
# (/opt/ceo-summit = préprod, /opt/ceo-summit-prod = prod). Le secret et le
# port viennent du .env de l'instance (MEETING_CRON_SECRET, HOST_APP_PORT).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

SECRET="$(env_value MEETING_CRON_SECRET || true)"
PORT="$(env_value HOST_APP_PORT || true)"
PORT="${PORT:-3020}"

if [ -z "$SECRET" ]; then
  echo "MEETING_CRON_SECRET absent de $ENV_FILE : expiration des demandes non configurée." >&2
  exit 1
fi

# Le secret passe par un fichier d'en-têtes plutôt que par la ligne de
# commande (visible dans `ps`).
curl --silent --show-error --fail --max-time 60 \
  --request POST \
  --header @<(printf 'Authorization: Bearer %s\n' "$SECRET") \
  "http://127.0.0.1:${PORT}/api/webhooks/meeting-expiry"
echo
