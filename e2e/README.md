# End-to-end tests (Playwright)

Tests against the real stack: Django (dev settings, PostgreSQL 18) and the **production build** of
the SSR frontend. Playwright starts both servers itself (ports 8000 and 3000, bound to `127.0.0.1`;
the browser opens the frontend as `http://localhost:3000`, because passkeys reject IP addresses);
`global-setup.ts` migrates the database and creates test data with randomly generated passwords.

## Prerequisites

- `docker compose up -d db mailpit` (in the repository root, `.env` present). The account tests
  read real emails from Mailpit's API.
- Backend dependencies installed (`cd backend && uv sync`) and frontend dependencies installed
  (`cd frontend && pnpm install`).
- Ports 3000 and 8000 free.

## Running

```bash
pnpm install
```

```bash
pnpm test
```

If a Chromium is preinstalled (e.g. in the Claude cloud environment) instead of the one Playwright
installs, point to it:

```bash
PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test
```

### Security-gate run (flag on)

The abuse case of the security gate (`gate/abuse-case.spec.ts`, WP 3B.6) and published feedback
(`gate/published-feedback.spec.ts`, WP 5.5) and Discover's campaign tab
(`gate/discover-campaigns.spec.ts`, WP 6.3) need public campaigns switched on. It runs separately, with `PUBLIC_CAMPAIGNS_ENABLED=true` for Django in this run only
(`playwright.gate.config.ts`); the main run keeps checking that public campaigns are locked. Run it
after the main run, never at the same time (same ports):

```bash
pnpm test:gate
```

The gate checklist for the project owner is [`docs/GATE-CHECKLIST.md`](../docs/GATE-CHECKLIST.md).

### Production-like stack (smoke tests, WP 8.6)

The production path – Caddy with TLS, the SSR server and Django under Gunicorn with production
settings – runs from `compose.prod.yaml` ([ADR 0032](../docs/adr/0032-production-setup.md)):

```bash
cp ../.env.prod.example ../.env.prod   # local values: SITE_ADDRESS=localhost, PUBLIC_HOST=localhost, random secrets
docker compose -f ../compose.prod.yaml --env-file ../.env.prod --profile local up -d --build
docker compose -f ../compose.prod.yaml --env-file ../.env.prod exec -T backend python manage.py migrate --noinput
pnpm test:smoke
```

Behind a TLS-inspecting proxy (Claude cloud sessions) build the images with
`CA_BUNDLE=/root/.ccr/ca-bundle.crt PUBLIC_HOST=localhost ../scripts/build-images.sh` and start
with `--no-build`. The login rate-limit test needs a fresh minute between two runs.

## Contents

`tests/ssr-auth.spec.ts` covers the six acceptance criteria of the SSR auth spike (WP 0.4, see
[`docs/MVP-PLAN.md`](../docs/MVP-PLAN.md)) plus security headers/CSP and "no logout via GET".

Accessibility (WP 8.6, [`docs/ACCESSIBILITY.md`](../docs/ACCESSIBILITY.md)):
`tests/a11y.spec.ts` checks every page with axe at 390 px in both themes and ends with the route
inventory (run the whole file: the inventory reads which pages the earlier tests visited);
`tests/keyboard.spec.ts` runs the core flows with the keyboard only; `tests/display.spec.ts`
covers reduced motion, 400 % zoom and 200 % text. A new page needs an axe check, or the inventory
test fails.
