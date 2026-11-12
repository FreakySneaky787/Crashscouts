# Backend (Django)

Python 3.14 · Django 6.1 · Django REST Framework · drf-spectacular · PostgreSQL 18 · Paketverwaltung mit [uv](https://docs.astral.sh/uv/)

## Struktur

```
backend/
├── config/            Projektkonfiguration
│   ├── settings/      base.py (gemeinsam), dev.py, test.py, prod.py, env.py (Env-Helfer)
│   └── urls.py
├── apps/
│   ├── core/          Basismodelle (UUIDv4, Zeitstempel), Health-Endpunkt
│   └── accounts/      eigenes User-Modell (UUIDv4-Primärschlüssel)
├── conftest.py        gemeinsame pytest-Fixtures
└── pyproject.toml     Abhängigkeiten (gesperrt in uv.lock), pytest- und Ruff-Konfiguration
```

Tests liegen bei ihrem Modul (`apps/<app>/tests/`).

## Lokal starten

Voraussetzungen: Docker und uv. Die Befehle laufen im Repository-Wurzelverzeichnis bzw. in `backend/`.

```bash
cp .env.example .env
```

In `.env` ein lokales `POSTGRES_PASSWORD` setzen. Die Datei wird von Git ignoriert.

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

Danach antwortet `http://127.0.0.1:8000/api/v1/health/` mit `{"status": "ok", "checks": {"database": "ok"}}`.

## Prüfen

```bash
uv run --env-file ../.env pytest
```

```bash
uv run ruff check . && uv run ruff format --check .
```

```bash
uv run --env-file ../.env python manage.py spectacular --validate --fail-on-warn --file /tmp/openapi.yaml
```

Die Tests laufen gegen **echtes PostgreSQL** (nicht SQLite). Die Datenbank aus `compose.yaml` muss laufen.

## Einstellungen

| Modul | Zweck |
|---|---|
| `config.settings.dev` | Standard für `manage.py`. `DEBUG` an, Browsable API und Schema-Endpunkt `/api/v1/schema/` aktiv |
| `config.settings.test` | Standard für pytest. `DEBUG` aus, kein Schema-Endpunkt |
| `config.settings.prod` | Standard für WSGI/ASGI. Startet **nicht** ohne `DJANGO_SECRET_KEY` (≥ 50 Zeichen, kein Entwicklungsschlüssel) und `DJANGO_ALLOWED_HOSTS`; erzwingt sichere Cookies, HTTPS-Weiterleitung und HSTS |

Die Konfiguration kommt ausschliesslich aus Umgebungsvariablen (siehe `.env.example`), nie aus dem Repository.

`manage.py check --deploy` meldet mit Produktions-Einstellungen bewusst nur `security.W005` und `security.W021` (HSTS `includeSubDomains` und `preload`). Beides wird erst nach der Wahl der Domain entschieden.
