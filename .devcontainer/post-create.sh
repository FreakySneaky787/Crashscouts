#!/usr/bin/env bash
# Runs once inside the dev container after it is created (devcontainer.json "postCreateCommand").
# Installs the pinned tool versions and all project dependencies, then migrates the database.
set -euo pipefail
cd "$(dirname "$0")/.."

# Pinned tool versions (keep in sync with docs/ARCHITECTURE.md and the cloud setup script).
UV_VERSION="0.13.7"
PNPM_VERSION="10.34.9"
GITLEAKS_VERSION="v8.30.1"

echo "==> uv ${UV_VERSION}"
python -m pip install --user --disable-pip-version-check --quiet "uv==${UV_VERSION}"
export PATH="${HOME}/.local/bin:${PATH}"

echo "==> pnpm ${PNPM_VERSION}"
npm install --global --silent "pnpm@${PNPM_VERSION}"

echo "==> gitleaks ${GITLEAKS_VERSION} (built via the Go module proxy, verified against sum.golang.org)"
GOBIN="${HOME}/.local/bin" go install "github.com/zricethezav/gitleaks/v8@${GITLEAKS_VERSION}"

echo "==> git hooks"
git config core.hooksPath .githooks

echo "==> backend dependencies"
(cd backend && uv sync --frozen)

echo "==> frontend dependencies"
(cd frontend && pnpm install --frozen-lockfile)

echo "==> e2e dependencies and Chromium"
(cd e2e && pnpm install --frozen-lockfile)
if [ "${SKIP_PLAYWRIGHT_BROWSERS:-0}" != "1" ]; then
  (cd e2e && pnpm exec playwright install --with-deps chromium)
fi

echo "==> database migrations"
(cd backend && uv run --env-file ../.env python manage.py migrate --noinput)

echo "==> done. See README.md for how to start backend and frontend."
