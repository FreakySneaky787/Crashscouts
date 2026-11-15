#!/usr/bin/env bash
# Builds the two application images of compose.prod.yaml (WP 8.6, ADR 0032).
# On a normal server `docker compose -f compose.prod.yaml build` is enough. This script is for
# build environments behind a TLS-inspecting proxy (such as Claude cloud sessions): it builds on
# the host network, passes the proxy as Docker's predefined build arguments (not kept in the
# image) and the proxy's CA as an optional build secret (never stored in the image).
#   CA_BUNDLE=/path/to/ca.crt PUBLIC_HOST=localhost scripts/build-images.sh
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_HOST="${PUBLIC_HOST:?set PUBLIC_HOST (e.g. localhost or crashscouts.org)}"
args=(--network host)
for name in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do
  if [ -n "${!name:-}" ]; then args+=(--build-arg "${name}=${!name}"); fi
done
if [ -n "${CA_BUNDLE:-}" ]; then args+=(--secret "id=ca,src=${CA_BUNDLE}"); fi
DOCKER_BUILDKIT=1 docker build "${args[@]}" -t crashscouts/backend:local "${REPO}/backend"
DOCKER_BUILDKIT=1 docker build "${args[@]}" --build-arg "ALLOWED_ACTION_ORIGINS=${PUBLIC_HOST}" \
  -t crashscouts/frontend:local "${REPO}/frontend"
