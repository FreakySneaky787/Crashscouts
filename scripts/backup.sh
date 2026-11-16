#!/usr/bin/env bash
# Encrypted off-site backup of the production server (WP 8.3, ADR 0033, docs/OPERATIONS.md §10).
#
# Backs up a PostgreSQL dump and the uploaded files (the `media` volume) with restic, then keeps
# only the snapshots of the last 7 days (owner's decision 2026-11-16) and checks the repository.
# restic encrypts on the server; the storage provider sees only encrypted data.
#
# Settings (root only, mode 600):
#   /etc/crashscouts/backup.env      RESTIC_REPOSITORY and the storage credentials (restic's
#                                    environment variables, e.g. OS_* for Swift)
#   /etc/crashscouts/restic-password the repository password (also in the owner's password manager)
#
#   sudo scripts/backup.sh init      # once: create the repository
#   sudo scripts/backup.sh           # nightly (crashscouts-backup.timer)
#   sudo scripts/backup.sh snapshots # list what is there
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
# Official image, restic 0.19.1 (released 2026-07-05, github.com/restic/restic), pinned by digest.
RESTIC_IMAGE=restic/restic:0.19.1@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510
CONFIG=/etc/crashscouts
STATE=/var/lib/crashscouts
KEEP_DAILY=7

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
for file in "$CONFIG/backup.env" "$CONFIG/restic-password"; do
  [ -f "$file" ] || { echo "Missing $file (docs/OPERATIONS.md §10)." >&2; exit 1; }
  [ "$(stat -c %a "$file")" = 600 ] || { echo "$file must have mode 600." >&2; exit 1; }
done

restic() {
  docker run --rm --hostname crashscouts-prod \
    --env-file "$CONFIG/backup.env" \
    -e RESTIC_PASSWORD_FILE=/run/restic-password \
    -v "$CONFIG/restic-password:/run/restic-password:ro" \
    -v crashscouts_restic_cache:/root/.cache/restic \
    "$@"
}

case "${1:-run}" in
  init)
    restic "$RESTIC_IMAGE" init
    exit 0
    ;;
  snapshots)
    restic "$RESTIC_IMAGE" snapshots
    exit 0
    ;;
  run) ;;
  *)
    echo "Usage: $0 [init|run|snapshots]" >&2
    exit 1
    ;;
esac

compose=(docker compose -f compose.prod.yaml --env-file .env.prod)
WORK="$(mktemp -d /var/tmp/crashscouts-backup.XXXXXX)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "== Database dump"
# Custom format: compressed, restorable with pg_restore, consistent (one transaction).
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$WORK/crashscouts.dump"
[ -s "$WORK/crashscouts.dump" ] || { echo "Empty database dump." >&2; exit 1; }
ls -l "$WORK/crashscouts.dump" | awk '{print "  " $5 " bytes"}'

echo "== Backup (database and uploaded files)"
restic -v "$WORK:/backup/db:ro" -v crashscouts_media:/backup/media:ro \
  "$RESTIC_IMAGE" backup --tag nightly /backup

echo "== Keeping the last ${KEEP_DAILY} days"
restic "$RESTIC_IMAGE" forget --tag nightly --keep-daily "$KEEP_DAILY" --prune

echo "== Checking the repository"
restic "$RESTIC_IMAGE" check

mkdir -p "$STATE"
date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE/last-backup"
echo "== Done"
