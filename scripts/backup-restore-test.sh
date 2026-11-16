#!/usr/bin/env bash
# Restore test (WP 8.3, ADR 0033, docs/OPERATIONS.md §10): restores the latest backup into a
# throwaway PostgreSQL container and a temporary folder on the server, compares it with the live
# data and removes everything again. Never touches the live stack.
#
#   sudo scripts/backup-restore-test.sh
#
# Passes when the dump restores without errors, the restored database has as many tables as the
# live one, no main table (users, projects, campaigns, feedback) that has rows live is empty in
# the backup, and every uploaded file in the backup is readable. The counts are printed side by
# side; the backup may be up to a day old, so small differences are expected.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
RESTIC_IMAGE="$(sed -n 's/^RESTIC_IMAGE=//p' scripts/backup.sh)"
# The same PostgreSQL image as compose.prod.yaml.
PG_IMAGE="$(sed -n 's/^ *image: \(postgres:18@sha256:[0-9a-f]*\)$/\1/p' compose.prod.yaml)"
CONFIG=/etc/crashscouts
NAME=crashscouts-restore-test

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
[ -n "$RESTIC_IMAGE" ] && [ -n "$PG_IMAGE" ] || { echo "Image names not found." >&2; exit 1; }

WORK="$(mktemp -d /var/tmp/crashscouts-restore.XXXXXX)"
chmod 700 "$WORK"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "== Restoring the latest snapshot"
docker run --rm --hostname crashscouts-prod \
  --env-file "$CONFIG/backup.env" \
  -e RESTIC_PASSWORD_FILE=/run/restic-password \
  -v "$CONFIG/restic-password:/run/restic-password:ro" \
  -v crashscouts_restic_cache:/root/.cache/restic \
  -v "$WORK:/restore" \
  "$RESTIC_IMAGE" restore latest --tag nightly --target /restore
dump="$WORK/backup/db/crashscouts.dump"
[ -s "$dump" ] || { echo "FAIL: no database dump in the snapshot." >&2; exit 1; }

echo "== Loading the dump into a throwaway database"
docker run -d --name "$NAME" --network none \
  -e POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')" \
  -e POSTGRES_USER=crashscouts -e POSTGRES_DB=crashscouts "$PG_IMAGE" >/dev/null
for _ in $(seq 60); do
  docker exec "$NAME" pg_isready -U crashscouts -d crashscouts >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$NAME" pg_restore -U crashscouts -d crashscouts --no-owner --exit-on-error < "$dump"

count_tables='SELECT count(*) FROM information_schema.tables WHERE table_schema = '"'"'public'"'"';'
rows() { echo "SELECT (SELECT count(*) FROM accounts_user), (SELECT count(*) FROM projects_project), (SELECT count(*) FROM campaigns_campaign), (SELECT count(*) FROM feedback_feedback);"; }
compose=(docker compose -f compose.prod.yaml --env-file .env.prod)
live_tables="$("${compose[@]}" exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA -c \"$count_tables\"")"
restored_tables="$(docker exec "$NAME" psql -U crashscouts -d crashscouts -tA -c "$count_tables")"
live_rows="$("${compose[@]}" exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA -c \"$(rows)\"")"
restored_rows="$(docker exec "$NAME" psql -U crashscouts -d crashscouts -tA -c "$(rows)")"

echo "== Comparison (live | restored)"
echo "  tables:                               ${live_tables} | ${restored_tables}"
echo "  users|projects|campaigns|feedback:    ${live_rows} | ${restored_rows}"
media_files="$(find "$WORK/backup/media" -type f | wc -l)"
unreadable="$(find "$WORK/backup/media" -type f ! -readable | wc -l)"
echo "  uploaded files in the backup:         ${media_files} (unreadable: ${unreadable})"

status=0
[ "$live_tables" = "$restored_tables" ] || { echo "FAIL: table count differs." >&2; status=1; }
IFS='|' read -r -a live <<< "$live_rows"
IFS='|' read -r -a restored <<< "$restored_rows"
for i in 0 1 2 3; do
  if [ "${live[$i]}" -gt 0 ] && [ "${restored[$i]}" -eq 0 ]; then
    echo "FAIL: a main table is empty in the backup but not live." >&2
    status=1
  fi
done
[ "$unreadable" -eq 0 ] || { echo "FAIL: unreadable files in the backup." >&2; status=1; }
[ "$status" -eq 0 ] && echo "== PASS: the backup restores completely"
exit "$status"
