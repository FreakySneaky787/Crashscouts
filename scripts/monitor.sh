#!/usr/bin/env bash
# Checks every 5 minutes that the site answers and the disk has room (WP 8.4, ADR 0034).
# Started by crashscouts-monitor.timer; reports to Healthchecks.io through hc-ping.sh.
#
# If the server is down, no signal arrives and Healthchecks.io alerts after the grace time. The
# check runs on the server itself, so a fault only visitors see (DNS, the provider's firewall)
# is not noticed; accepted for the beta (ADR 0034).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${CRASHSCOUTS_ENV_FILE:-$REPO/.env.prod}"
DISK_PATH="${CRASHSCOUTS_DISK_PATH:-/}"
DISK_LIMIT=80  # percent

host="$(sed -n 's/^PUBLIC_HOST=//p' "$ENV_FILE" 2>/dev/null | tail -n 1)"

# /discover goes through Caddy, the SSR server, Django and PostgreSQL.
site=1
if [ -n "$host" ] && [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://${host}/discover")" = 200 ]; then
  site=0
fi

used="$(df --output=pcent "$DISK_PATH" | tail -n 1 | tr -dc 0-9)"
disk=1
if [ -n "$used" ] && [ "$used" -lt "$DISK_LIMIT" ]; then disk=0; fi

echo "site: $([ $site -eq 0 ] && echo ok || echo FAIL), disk: ${used:-?}% used"
"$REPO/scripts/hc-ping.sh" site "$site"
"$REPO/scripts/hc-ping.sh" disk "$disk"
exit 0
