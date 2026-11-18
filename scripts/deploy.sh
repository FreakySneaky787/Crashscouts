#!/usr/bin/env bash
# Updates the running platform to the latest main (WP 8.1, docs/OPERATIONS.md §9).
# Run as the login user, not with sudo: git pulls with that user's deploy key; the Docker
# commands use sudo themselves.
#   cd /opt/crashscouts && scripts/deploy.sh
#
# Order: pull, build the new images, migrate the database with the new backend image, then
# replace the running containers and send a few warm-up requests (the first requests after a
# start are slow, docs/PERFORMANCE.md).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
if [ "$(id -u)" -eq 0 ]; then
  echo "Run without sudo: git needs the login user's deploy key." >&2
  exit 1
fi
[ -f .env.prod ] || { echo "Missing .env.prod (docs/OPERATIONS.md §6)." >&2; exit 1; }

compose=(sudo docker compose -f compose.prod.yaml --env-file .env.prod)
# The mail catcher (profile "local") runs only while mail goes to it instead of a provider.
if grep -qx 'DJANGO_EMAIL_HOST=mailpit' .env.prod; then compose+=(--profile local); fi

echo "== Pulling"
before="$(git rev-parse HEAD)"
git pull --ff-only
git log --oneline -1
echo "== Building"
"${compose[@]}" build
echo "== Migrating"
"${compose[@]}" run --rm --no-deps backend python manage.py migrate --noinput
echo "== Starting"
"${compose[@]}" up -d --no-build --wait
# Caddy reads its mounted Caddyfile only at start ("admin off" rules out a live reload), and
# `up` does not recreate the container for a changed file: restart it when the file changed.
if ! git diff --quiet "$before" HEAD -- deploy/Caddyfile; then
  echo "== Restarting the proxy (Caddyfile changed)"
  "${compose[@]}" restart proxy
fi
echo "== Warm-up"
host="$(sed -n 's/^PUBLIC_HOST=//p' .env.prod)"
# `up --wait` only waits for the database's health check; the SSR server needs a few seconds
# more before it listens (Caddy answers 502 until then, seen in the local test).
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "https://${host}/")" = 200 ] && break
  sleep 1
done
for path in / /discover /login; do
  curl -s -o /dev/null -w "  ${path} %{http_code} %{time_total}s\n" "https://${host}${path}"
done
