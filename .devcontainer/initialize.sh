#!/usr/bin/env bash
# Runs on the HOST before the dev container starts (devcontainer.json "initializeCommand").
# Creates a local .env with a random database password if none exists yet.
# .env is ignored by Git; the password never leaves this machine/codespace.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  exit 0
fi

cp .env.example .env
password="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
# "-i.bak" keeps this portable between GNU and BSD sed.
sed -i.bak "s|^POSTGRES_PASSWORD=\$|POSTGRES_PASSWORD=${password}|" .env
rm -f .env.bak

if ! grep -q "^POSTGRES_PASSWORD=${password}\$" .env; then
  echo "initialize.sh: could not set POSTGRES_PASSWORD in .env" >&2
  exit 1
fi
echo "initialize.sh: created .env with a random local database password."
