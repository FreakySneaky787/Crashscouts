#!/usr/bin/env bash
# Setup for Claude Code cloud sessions (stored as the environment's setup script; runs as root
# in the directory that contains the repository checkouts, before Claude starts).
# Mirrors .devcontainer/post-create.sh. Keep the pinned versions in sync.
#
# Not done here on purpose:
# - Starting the Docker daemon (no background daemons in setup scripts). Start it per session
#   with `dockerd` when `docker info` cannot reach it, then `docker compose up -d db`.
# - Installing Playwright browsers: the environment provides Chromium at /opt/pw-browsers.
set -euo pipefail

UV_VERSION="0.13.7"
PNPM_VERSION="10.34.9"
GITLEAKS_VERSION="v8.30.1"

if [ ! -d testhub ]; then
  echo "cloud-setup: repository 'testhub' not found here, nothing to do."
  exit 0
fi

echo "==> uv ${UV_VERSION}"
python3 -m pip install --user --break-system-packages --disable-pip-version-check --quiet \
  "uv==${UV_VERSION}"
export PATH="${HOME}/.local/bin:${PATH}"
uv --version

echo "==> Python 3.14"
uv python install 3.14

echo "==> pnpm ${PNPM_VERSION}"
npm install --global --silent "pnpm@${PNPM_VERSION}"
pnpm --version

echo "==> gitleaks ${GITLEAKS_VERSION} (Go module proxy, verified against sum.golang.org)"
GOBIN="${HOME}/.local/bin" go install "github.com/zricethezav/gitleaks/v8@${GITLEAKS_VERSION}"

echo "==> git hooks"
git -C testhub config core.hooksPath .githooks

echo "==> backend dependencies"
(cd testhub/backend && uv sync --frozen)

echo "==> frontend and e2e dependencies"
(cd testhub/frontend && pnpm install --frozen-lockfile)
(cd testhub/e2e && pnpm install --frozen-lockfile)

echo "==> cloud-setup done"
