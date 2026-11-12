# 0001 – Modularer Monolith mit Django und React

- Status: Akzeptiert
- Datum: 2026-11-12

## Kontext

Kleines Team (anfangs eine Person), ein Kern-MVP und hohe Anforderungen an Sicherheit und Wartbarkeit. Der Master-Prompt gibt React, TypeScript, Vite, Django, DRF, PostgreSQL und Docker vor und schliesst Microservices für das MVP aus.

## Entscheidung

- Ein Django-Projekt mit fachlich getrennten Apps (`core`, `accounts`, `profiles`, `catalog`, `projects`, `campaigns`, `testing`, `feedback`, `moderation`, `notifications`, `audit`, `discover`).
- Eine PostgreSQL-Datenbank.
- Ein React-Frontend.
- Die Logik pro App liegt in `services.py` und `selectors.py`; Berechtigungen prüft eine zentrale Policy-Schicht.

## Alternativen

- **Microservices:** unnötige Betriebs- und Konsistenzkomplexität für ein MVP.
- **Reines Django mit Templates:** einfacher, aber weg vom vorgegebenen React-Stack (siehe ADR 0002).

## Konsequenzen

- Ein einfaches Deployment mit Docker Compose.
- Klare Modulgrenzen machen spätere Auslagerungen möglich, ohne sie vorwegzunehmen.
- Modulgrenzen müssen per Konvention und Review eingehalten werden.
