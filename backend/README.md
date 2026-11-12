# Backend (Django)

Python 3.14 · Django 6.1 · Django REST Framework · drf-spectacular · django-allauth (headless) ·
PostgreSQL 18 · package management with [uv](https://docs.astral.sh/uv/)

## Layout

```
backend/
├── config/            project configuration
│   ├── settings/      base.py (shared), dev.py, test.py, prod.py, env.py (env helpers)
│   └── urls.py
├── apps/
│   ├── core/          base models (UUIDv4, timestamps), health endpoint
│   ├── accounts/      custom user model (UUIDv4 primary key), allauth tests
│   └── ssr_probe/     TEST ONLY: probe objects for the SSR spike (never installed in production)
├── conftest.py        shared pytest fixtures
└── pyproject.toml     dependencies (locked in uv.lock), pytest and Ruff configuration
```

Tests live next to their module (`apps/<app>/tests/`).

## Running locally

Prerequisites: Docker and uv. Commands run in the repository root or in `backend/`.

```bash
cp .env.example .env
```

Set a local `POSTGRES_PASSWORD` in `.env`. The file is ignored by Git.

```bash
docker compose up -d db
```

```bash
cd backend && uv sync
```

```bash
uv run --env-file ../.env python manage.py migrate
```

```bash
uv run --env-file ../.env python manage.py runserver 127.0.0.1:8000
```

Afterwards `http://127.0.0.1:8000/api/v1/health/` answers `{"status": "ok", "checks": {"database": "ok"}}`.

## Checks

```bash
uv run --env-file ../.env pytest
```

```bash
uv run ruff check . && uv run ruff format --check .
```

```bash
uv run --env-file ../.env python manage.py spectacular --validate --fail-on-warn --file /tmp/openapi.yaml
```

Tests run against a **real PostgreSQL** (not SQLite); the database from `compose.yaml` must be
running.

## Settings

| Module | Purpose |
|---|---|
| `config.settings.dev` | Default for `manage.py`. `DEBUG` on, browsable API and schema endpoint `/api/v1/schema/`, SSR probe installed, CSRF trusted origins `http://localhost:5173` and `http://127.0.0.1:5173` (override with `DJANGO_CSRF_TRUSTED_ORIGINS`) |
| `config.settings.test` | Default for pytest. `DEBUG` off, no schema endpoint, SSR probe installed |
| `config.settings.prod` | Default for WSGI/ASGI. Refuses to start without `DJANGO_SECRET_KEY` (≥ 50 characters, not a development key) and `DJANGO_ALLOWED_HOSTS`, or if the SSR probe is installed; enforces secure cookies, HTTPS redirect and HSTS |

Configuration comes exclusively from environment variables (see `.env.example`), never from the
repository.

With production settings, `manage.py check --deploy` deliberately reports only `security.W005` and
`security.W021` (HSTS `includeSubDomains` and `preload`). Both are decided once the domain is chosen.

## Authentication (current state)

django-allauth in headless mode with the `browser` client only, under `/_allauth/browser/v1/`.
Only login, logout and the session endpoint are in use; signup is disabled until phase 1 (see
[ADR 0004](../docs/adr/0004-authentication-with-allauth.md)).
