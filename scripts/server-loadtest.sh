#!/usr/bin/env bash
# Load test on the server before it goes live (WP 8.1, docs/OPERATIONS.md, docs/PERFORMANCE.md).
#
# Runs the production stack as "localhost" under its own Compose project, with Caddy bound to
# 127.0.0.1 only (nothing is reachable from outside), throwaway secrets and generated data (no real
# people). Locust runs 20 users for 5 minutes in a container on the host network. Prints the
# result and the memory peak, then removes the test stack, its volumes and the frontend image
# built for "localhost". Never touches the real project "crashscouts".
#
#   sudo scripts/server-loadtest.sh                 # on the server
#   NO_BUILD=1 CA_BUNDLE=/path/ca.crt sudo -E ...   # images already built; TLS-inspecting proxy
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
PROJECT=crashscouts-loadtest
DURATION="${DURATION:-5m}"
# The image of backend/Dockerfile (Python 3.14) and uv as pinned in scripts/cloud-setup.sh.
PYTHON_IMAGE=python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f
UV_VERSION=0.13.7

if docker compose ls --all --format json | grep -q '"Name":"crashscouts"'; then
  echo "The real stack (project crashscouts) exists; stop it before a load test." >&2
  exit 1
fi

WORK="$(mktemp -d)"
chmod 700 "$WORK"
secret() { python3 -c 'import secrets; print(secrets.token_urlsafe(48))'; }
{
  echo "SITE_ADDRESS=localhost"
  echo "PUBLIC_HOST=localhost"
  echo "HTTP_PORT=127.0.0.1:80"
  echo "HTTPS_PORT=127.0.0.1:443"
  echo "DJANGO_SECRET_KEY=$(secret)"
  echo "POSTGRES_PASSWORD=$(secret)"
  echo "DJANGO_EMAIL_HOST=mailpit"
  echo "DJANGO_EMAIL_PORT=1025"
  echo "DJANGO_EMAIL_USE_TLS=false"
  echo "DJANGO_DEFAULT_FROM_EMAIL=Crashscouts <no-reply@localhost>"
  echo "DJANGO_SIGNUP_ENABLED=true"
  echo "PUBLIC_DEPLOYMENT=true"
  echo "OPERATOR_NAME=Load Test Operator"
  echo "OPERATOR_ADDRESS=Example Street 1"
  echo "CONTACT_EMAIL=contact@example.test"
} > "$WORK/env"

compose() {
  docker compose -p "$PROJECT" -f compose.prod.yaml -f compose.loadtest.yaml \
    --env-file "$WORK/env" --profile local "$@"
}
STATS_PID=""
cleanup() {
  [ -n "$STATS_PID" ] && kill "$STATS_PID" 2>/dev/null || true
  echo "== Removing the test stack and its data"
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  # Built for "localhost"; the real deployment builds its own for the domain.
  docker image rm crashscouts/frontend:local >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ -z "${NO_BUILD:-}" ]; then
  echo "== Building the images (takes several minutes the first time)"
  compose build
fi
echo "== Starting the stack on 127.0.0.1"
compose up -d --no-build --wait
compose exec -T backend python manage.py migrate --noinput >/dev/null
echo "== Generating test data (about a minute)"
compose exec -T backend python manage.py seed_load_data \
  --credentials /tmp/logins.json --targets /tmp/targets.json
backend="$(compose ps -q backend)"
docker cp -q "$backend:/tmp/logins.json" "$WORK/logins.json"
docker cp -q "$backend:/tmp/targets.json" "$WORK/targets.json"

echo "== Warm-up"
for path in / /discover /login; do
  curl -sk -o /dev/null -w "  ${path} %{http_code} %{time_total}s\n" "https://localhost${path}"
done

# Memory and CPU of the stack every 15 seconds while Locust runs.
( while sleep 15; do
    docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' >> "$WORK/stats.txt"
  done ) &
STATS_PID=$!

echo "== Locust: 20 users for ${DURATION}"
ca_args=()
if [ -n "${CA_BUNDLE:-}" ]; then
  ca_args=(-v "${CA_BUNDLE}:/ca.crt:ro" -e PIP_CERT=/ca.crt -e SSL_CERT_FILE=/ca.crt)
fi
docker run --rm --name "$PROJECT-locust" --network host "${ca_args[@]}" \
  -e HTTP_PROXY -e HTTPS_PROXY -e NO_PROXY=localhost,127.0.0.1 \
  -e LOGINS=/work/logins.json -e TARGETS=/work/targets.json \
  -e UV_PROJECT_ENVIRONMENT=/tmp/venv -e UV_CACHE_DIR=/tmp/uv-cache \
  -v "$REPO/loadtest:/lt:ro" -v "$WORK:/work" -w /lt "$PYTHON_IMAGE" \
  sh -c "pip install --no-cache-dir -q --root-user-action=ignore uv==${UV_VERSION} \
    && uv run -q --frozen locust -f locustfile.py --headless -u 20 -r 2 -t ${DURATION} \
       --host https://localhost --csv /work/run --only-summary" > "$WORK/locust.log" 2>&1 \
  || { tail -40 "$WORK/locust.log"; exit 1; }
kill "$STATS_PID" 2>/dev/null || true
STATS_PID=""

echo
echo "== Result (milliseconds)"
python3 - "$WORK/run_stats.csv" <<'PY'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1])))
print(f"{'Name':<34}{'Requests':>9}{'Fails':>7}{'p50':>7}{'p95':>7}{'max':>8}")
for r in rows:
    print(f"{r['Name'][:33]:<34}{r['Request Count']:>9}{r['Failure Count']:>7}"
          f"{r['50%']:>7}{r['95%']:>7}{float(r['Max Response Time']):>8.0f}")
PY
echo
echo "== Memory peak per container (MiB) and CPU peak"
python3 - "$WORK/stats.txt" <<'PY'
import re, sys
peak = {}
units = {"KiB": 1 / 1024, "MiB": 1, "GiB": 1024, "B": 1 / 1048576}
for line in open(sys.argv[1]):
    name, usage, _, _, cpu = line.split()
    value, unit = re.match(r"([\d.]+)(\w+)", usage).groups()
    mem = float(value) * units[unit]
    old = peak.get(name, (0, 0))
    peak[name] = (max(old[0], mem), max(old[1], float(cpu.rstrip("%"))))
stack = {n: v for n, v in peak.items() if n.startswith("crashscouts-loadtest-") and not n.endswith("-locust")}
for name, (mem, cpu) in sorted(stack.items()):
    print(f"{name:<40}{mem:>8.0f}{cpu:>8.1f}%")
print(f"{'stack total (without Locust)':<40}{sum(m for m, _ in stack.values()):>8.0f}")
PY
