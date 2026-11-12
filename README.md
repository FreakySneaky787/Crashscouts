# TestHub (working name)

> **Note:** "TestHub" is a provisional placeholder, not a product name.

An open-source platform that connects software developers with volunteer testers.
Developers find testers for their beta versions; testers discover new software and help improve it
with structured feedback.

*Test software together. Make it better together.*

## Status

🚧 **Early development, phase 0 (foundation).** A backend skeleton and a validated server-side
rendering spike exist; there are no product features yet. The actual state is tracked in
[`docs/STATUS.md`](docs/STATUS.md).

## Documentation

| Document | Content |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements (core MVP) |
| [`docs/MVP-PLAN.md`](docs/MVP-PLAN.md) | Phases, work packages, security gate |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture, data model, API, permissions |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security concept |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md) | Open questions |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Plans beyond the MVP |
| [`docs/MASTER-PROMPT.md`](docs/MASTER-PROMPT.md) | Original project brief (English translation; German original in [`MASTER-PROMPT.de.md`](docs/MASTER-PROMPT.de.md)) |

## Stack

Python 3.14 · Django 6.1 · Django REST Framework · django-allauth · PostgreSQL 18 · React 19 ·
React Router 8 (SSR) · Vite 8 · TypeScript 6 · Docker Compose

## Repository layout

| Path | Content |
|---|---|
| [`backend/`](backend/) | Django API ([README](backend/README.md)) |
| [`frontend/`](frontend/) | React Router SSR app ([README](frontend/README.md)) |
| [`e2e/`](e2e/) | Playwright end-to-end tests ([README](e2e/README.md)) |
| [`docs/`](docs/) | Product and architecture documentation |
| `compose.yaml` | Development services (PostgreSQL) |

## License

[GNU Affero General Public License v3.0](LICENSE). Anyone who runs a modified version as a network
service must make its source code available to its users.
