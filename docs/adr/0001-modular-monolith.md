# 0001 – Modular monolith with Django and React

- Status: Accepted
- Date: 2026-11-12

## Context

The team is small (initially one person), the scope is a core MVP, and the requirements for
security and maintainability are high. The master prompt prescribes React, TypeScript, Vite,
Django, DRF, PostgreSQL and Docker, and rules out microservices for the MVP.

## Decision

- One Django project with apps separated by domain (`core`, `accounts`, `profiles`, `catalog`,
  `projects`, `campaigns`, `testing`, `feedback`, `moderation`, `notifications`, `audit`,
  `discover`).
- One PostgreSQL database.
- One React frontend.
- Per app, logic lives in `services.py` (writes) and `selectors.py` (reads); authorization is
  checked by a central policy layer.

## Alternatives

- **Microservices:** unnecessary operational and consistency complexity for an MVP.
- **Plain Django with templates:** simpler, but departs from the prescribed React stack (see
  ADR 0002).

## Consequences

- Simple deployment with Docker Compose.
- Clear module boundaries keep later extraction possible without anticipating it.
- Module boundaries must be enforced by convention and review.
