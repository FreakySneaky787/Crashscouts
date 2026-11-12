# Entwicklungsstand

> Diese Datei beschreibt den **tatsächlichen** Stand. Sie wird bei jedem abgeschlossenen Arbeitspaket aktualisiert.
> Als erledigt gilt nur, was nachweislich geprüft wurde.

**Letzte Aktualisierung:** 2026-11-12 (AP 0.3) · **Aktuelle Phase:** 0 – Foundation

## Arbeitspakete

| AP | Status | Nachweis |
|---|---|---|
| 0.1 Repo anbinden, Umgebung prüfen | ✅ erledigt | siehe unten |
| 0.2 Doku-Grundgerüst | ✅ erledigt | Doku entspricht dem freigegebenen Plan; gitleaks-Scan ohne Funde |
| 0.3 Backend-Skelett | ✅ erledigt | 24 Tests grün gegen PostgreSQL 18.6; Ruff ohne Befunde; OpenAPI validiert |
| 0.4 Frontend-Skelett und SSR-Auth-Durchstich | ⏳ offen | – |
| 0.5 Dev-Container und Setup-Skript | ⏳ offen | – |
| 0.6 CI und pre-commit | ⏳ offen | – |
| 0.7 Playwright-Grundgerüst | ⏳ offen | – |

## Ergebnisse AP 0.1 (2026-11-12)

- Repository `FreakySneaky787/testhub`: privat, Standard-Branch `main`, zu Beginn leer.
- **Claude-Cloud-Umgebung:** Ubuntu 24.04, 4 CPU, 15 GB RAM.
  - Vorinstalliert: Python 3.13.18, Node 22.23.4, pnpm 10.28.0, uv 0.11.32, Docker-CLI 29.9.2 mit Compose v5.6.1.
  - Die Zielversionen Python 3.14 und Node 24 kommen erst mit AP 0.3 bis 0.5.
- **Docker-Daemon:** startet in der Cloud-Umgebung (manueller Start von `dockerd`).
- **PostgreSQL:** Das offizielle Image `postgres:18` ergab PostgreSQL **18.6**; der Lese- und Schreibtest war erfolgreich, Port nur an `127.0.0.1` gebunden. Der Testcontainer wurde danach entfernt.
- **Hinweis:** Die Umgebung nutzt cgroup v1. Docker meldet, dass die Unterstützung spätestens im Mai 2029 entfällt; für die Entwicklung unkritisch.

## Ergebnisse AP 0.2 (2026-11-12)

- Die Doku unter `docs/` und die ADRs 0001–0006 sind angelegt, ebenso `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` (Entwurf), `SECURITY.md` (vorläufig) und `LICENSE`.
- Der `LICENSE`-Text (AGPL-3.0) stammt aus GitHubs Lizenzvorlage (choosealicense.com) und ist inhaltlich gegen die SPDX-Lizenzliste geprüft. Einziger Unterschied: `https` statt `http` in drei FSF-URLs.
- gitleaks v8.30.1 wurde über den Go-Modul-Proxy mit Prüfsummenkontrolle gebaut; sein Scan des Repos fand nichts.

## Ergebnisse AP 0.3 (2026-11-12)

- **Backend unter `backend/`:**
  - Installiert: Python 3.14.6, Django 6.1.3, DRF 3.18.3, drf-spectacular 0.30.0, psycopg 3.3.9 und argon2-cffi 25.1.0.
  - Für Tests und Lint: pytest 9.2.0, pytest-django 4.14.0 und Ruff 0.17.4.
  - Alle Abhängigkeiten sind in `backend/uv.lock` gesperrt.
- **Umgesetzt:**
  - Getrennte Einstellungen (dev, test, prod); Konfiguration nur aus Umgebungsvariablen.
  - Eigenes User-Modell mit UUIDv4-Primärschlüssel und abstrakte Basismodelle (`apps.core.models`).
  - Argon2 als primärer Passwort-Hasher.
  - API standardmässig nur für angemeldete Nutzer; die Browsable API nur in der Entwicklung.
  - `GET /api/v1/health/` prüft die Datenbank, gibt im Fehlerfall 503 ohne Details zurück und setzt `Cache-Control: no-store`.
  - Der OpenAPI-Schema-Endpunkt ist nur in der Entwicklung erreichbar.
- **Produktions-Einstellungen:**
  - Kein Start ohne `DJANGO_SECRET_KEY` (≥ 50 Zeichen, kein Entwicklungsschlüssel) und ohne `DJANGO_ALLOWED_HOSTS`.
  - Sichere Cookies, HTTPS-Weiterleitung und HSTS für 1 Jahr.
- `compose.yaml` enthält den Datenbankdienst `postgres:18`, per Digest fixiert und nur an `127.0.0.1` gebunden.
- **Nachweise (ausgeführt am 2026-11-12):**
  - `pytest`: 24 Tests bestanden, gegen PostgreSQL 18.6.
  - `ruff check` und `ruff format --check`: ohne Befunde.
  - `manage.py spectacular --validate --fail-on-warn`: ohne Fehler.
  - `manage.py check --deploy` (prod): nur die dokumentierten Warnungen W005 und W021.
  - Gegenproben: Drei absichtlich eingebaute Fehler (Schema-Endpunkt aktiv, Fehlerdetails im Health-Endpunkt, unsicheres Session-Cookie) wurden jeweils von den Tests erkannt.
- **Hinweis:** drf-spectacular 0.30.0 und pytest-django 4.14.0 deklarieren offiziell Django nur bis 6.0. Mit Django 6.1.3 laufen sie in unseren Tests fehlerfrei; bei Updates wird das beobachtet.

## Bekannte Einschränkungen

- GitHub Free bei privaten Repos: keine Push Protection und kein Branch-Schutz (siehe [`SECURITY.md`](SECURITY.md), Abschnitt 10).
- Noch keine CI (AP 0.6), kein Frontend (AP 0.4) und kein Dev-Container (AP 0.5).
- Der Docker-Daemon muss in Claude-Cloud-Sitzungen bisher von Hand gestartet werden (`dockerd`); das Setup-Skript folgt in AP 0.5.
