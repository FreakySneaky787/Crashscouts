# Contributing

Thank you for helping. Crashscouts is in a closed beta, built by one person; small, focused
contributions are the easiest to review.

- **Bugs and ideas:** open an issue first, so we can agree on the approach before you write code.
  Security problems go through [`SECURITY.md`](SECURITY.md), never a public issue.
- **Pull requests:** against `main`, with tests, and with the documentation updated in the same
  change. CI must be green.
- **Code of conduct:** everyone taking part follows the
  [Contributor Covenant](CODE_OF_CONDUCT.md).

## Developer Certificate of Origin (DCO)

Every commit must be signed off. With the sign-off you confirm the
[Developer Certificate of Origin 1.1](https://developercertificate.org/): you wrote the change
or have the right to submit it under the project's licence (AGPL-3.0). There is no contributor
licence agreement to sign.

```bash
git commit -s -m "Fix the date in the campaign list"
```

`-s` adds the line `Signed-off-by: Your Name <you@example.org>`, which must match the commit's
author. A check in CI refuses pull requests with commits that are not signed off
(`scripts/check-dco.sh`). To sign off commits you already made: `git rebase --signoff main`, then
push again.

## Principles

- **Small, traceable changes**, each with tests.
- **No secrets** (tokens, passwords, keys, real personal data) in code, tests, logs or commits.
  Tests generate credentials at runtime.
- **English** for documentation, code comments and commit messages.
- **Keep the docs current:** `docs/STATUS.md` and affected documents belong in the same change.
- Significant architecture or technology decisions are recorded as ADRs in
  [`docs/adr/`](docs/adr/).

## Development environment

- **GitHub Codespaces / VS Code Dev Containers:** open the repository in a Codespace; the dev
  container creates `.env`, starts PostgreSQL, installs everything and migrates. For Claude Code,
  store `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY` as a
  Codespaces secret – never in the repository.
- **Claude Code cloud sessions:** the environment's setup script runs `scripts/cloud-setup.sh`.
  Start the database per session: `dockerd` (if `docker info` fails), then `docker compose up -d db mailpit`.
- **Elsewhere:** Docker, Python 3.14 with uv 0.13.7, Node ≥ 22.22 with pnpm 10.34.9;
  `cp .env.example .env`, set `POSTGRES_PASSWORD`, `docker compose up -d db mailpit`.

## Tests

| Part | How | Details |
|---|---|---|
| Backend | pytest against a real PostgreSQL 18; Ruff for lint and formatting | [`backend/README.md`](backend/README.md) |
| Frontend | Vitest, ESLint, `tsc` | [`frontend/README.md`](frontend/README.md) |
| End-to-end | Playwright against Django and the production SSR build | [`e2e/README.md`](e2e/README.md) |

CI (`.github/workflows/ci.yml`) runs all of the above on every push to `main` and on pull
requests.

## Pre-commit hook

`git config core.hooksPath .githooks` activates `.githooks/pre-commit` (done automatically in the
dev container and the cloud setup). It scans staged changes with gitleaks and runs Ruff/ESLint
for staged files. It blocks the commit if gitleaks is not available – install it with
`GOBIN=$HOME/.local/bin go install github.com/zricethezav/gitleaks/v8@v8.30.1` or make Docker
available. Do not bypass it with `--no-verify`.
