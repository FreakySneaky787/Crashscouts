# 0032 – Production setup

- Status: Accepted
- Date: 2026-11-15

## Context

The owner ordered an Infomaniak VPS Lite (Switzerland, 2 vCPU / 4 GB) for the beta and decided on
2026-11-15:
- Caddy as reverse proxy;
- Gunicorn for Django;
- the way of running it left to Claude, who chose Docker Compose as in development.

Until then the platform had only run in the development setup:
- Django's development server;
- `react-router-serve`;
- plain HTTP.

The production path had never been tested end to end: TLS, `__Host-` cookies, proxy headers and
the SSR server behind a proxy (open question P).

## Decision

- **`compose.prod.yaml`:** four services, and only Caddy publishes ports (80, 443).
  - `proxy` (Caddy);
  - `frontend` (React Router SSR server);
  - `backend` (Django under Gunicorn with `config.settings.prod`);
  - `db` (PostgreSQL 18).
- **Images:** official images pinned by digest (Docker Hub, checked 2026-11-15):
  - `caddy:2` (Caddy 2.11.9);
  - `python:3.14-slim` (Python 3.14.10);
  - `node:22-slim` (Node 22.23.5);
  - `postgres:18` (18.6, as in development).

  The applications run as unprivileged users. Dependencies come only from the lockfiles.
- **Gunicorn 26.2.0** (released 2026-08-24, PyPI), not the brand-new 27.0 line from 2026-11-10:
  supply-chain caution. Three sync workers, no control socket.
- **Only the SSR server is routed.**
  - The browser never talks to Django directly; the SSR server calls it on the internal network.
  - Caddy answers 404 for `/admin`, `/api`, `/_allauth` and `/media`.
  - This corrects the earlier sketch in `ARCHITECTURE.md`, which routed `/api` and `/_allauth`
    to Django.
- **Proxy headers (question P):**
  - Caddy ignores `X-Forwarded-*` from clients and sets them itself.
  - The SSR server trusts `X-Forwarded-Proto` only with `TRUST_PROXY_HEADERS=true` (set in
    `compose.prod.yaml`) and passes the scheme on to Django.
  - React Router's action origin check accepts the public host through `allowedActionOrigins`,
    set at build time from `PUBLIC_HOST`.
  - Django counts the last forwarded address (`DJANGO_TRUSTED_PROXY_COUNT=1`). A forged
    `X-Forwarded-For` is therefore ignored twice: by Caddy and by Django.
- **TLS:**
  - locally, Caddy's internal CA for `localhost`;
  - on the server, Let's Encrypt for the domain, automatically;
  - HTTP redirects to HTTPS.
- **Request size:** request bodies are limited to 6 MB (uploads are at most 5 MB).
- **Settings:** from `.env.prod` (template `.env.prod.example`), never committed. The SSR server
  refuses to start without the operator details (ADR 0031).
- **Builds behind a TLS-inspecting proxy** (such as Claude cloud sessions): use
  `scripts/build-images.sh`.
  - The proxy is passed as Docker's predefined build arguments, which are not kept in the image.
  - The proxy's CA is passed as an optional build secret, which is never stored. Checked: neither
    appears in the image environment or history.
- **Verification:** the CI job "Production stack" builds the images, starts the stack and runs the
  smoke tests (`e2e/smoke/`) against `https://localhost`.

## Alternatives

- Running everything directly on the server with systemd: less memory, but not reproducible
  locally.
- nginx: more configuration and a separate tool for certificates.
- Routing `/api` publicly: not needed by the browser, more attack surface.

## Consequences

- WP 8.1 brings the same stack to the VPS. Still open there:
  - the domain in `.env.prod`;
  - the scheduler for the purge jobs;
  - backups (WP 8.3);
  - firewall and SSH access.
- Image updates change the digests in the Dockerfiles and `compose.prod.yaml`; Dependabot covers
  Docker.
