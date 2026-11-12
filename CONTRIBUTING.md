# Mitwirken

> **Entwurf.** Das Repository ist noch privat. Das Beitragsmodell (DCO oder CLA) und der Verhaltenskodex werden vor dem Öffentlichschalten festgelegt (siehe [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md), Fragen G und J).

## Grundsätze

- **Kleine, nachvollziehbare Änderungen**, jeweils mit Tests.
- **Keine Secrets** (Tokens, Passwörter, Schlüssel, echte Personendaten) in Code, Tests, Logs oder Commits.
- **Doku aktuell halten:** `docs/STATUS.md` und betroffene Dokumente gehören in dieselbe Änderung.
- Wesentliche Architektur- oder Technologieentscheidungen werden als ADR in [`docs/adr/`](docs/adr/) festgehalten.

## Entwicklungsumgebung

Wird mit AP 0.5 beschrieben: Dev-Container für GitHub Codespaces und ein Setup für Claude-Code-Cloud-Sitzungen.

## Tests

- Backend: siehe [`backend/README.md`](backend/README.md). pytest läuft gegen echtes PostgreSQL 18; Ruff übernimmt Lint und Formatierung.
- Frontend und E2E (Vitest, Playwright) folgen mit AP 0.4 bis 0.7.
