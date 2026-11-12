# Contributing

> **Draft.** The repository is still private. The contribution model (DCO or CLA) and the code of
> conduct will be decided before it goes public (see
> [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md), questions G and J).

## Principles

- **Small, traceable changes**, each with tests.
- **No secrets** (tokens, passwords, keys, real personal data) in code, tests, logs or commits.
  Tests generate credentials at runtime.
- **English** for documentation, code comments and commit messages.
- **Keep the docs current:** `docs/STATUS.md` and affected documents belong in the same change.
- Significant architecture or technology decisions are recorded as ADRs in
  [`docs/adr/`](docs/adr/).

## Development environment

- Database: `cp .env.example .env`, set `POSTGRES_PASSWORD`, then `docker compose up -d db`.
- Dev container for GitHub Codespaces and a setup for Claude Code cloud sessions follow in WP 0.5.

## Tests

| Part | How | Details |
|---|---|---|
| Backend | pytest against a real PostgreSQL 18; Ruff for lint and formatting | [`backend/README.md`](backend/README.md) |
| Frontend | Vitest, ESLint, `tsc` | [`frontend/README.md`](frontend/README.md) |
| End-to-end | Playwright against Django and the production SSR build | [`e2e/README.md`](e2e/README.md) |

CI follows in WP 0.6.
