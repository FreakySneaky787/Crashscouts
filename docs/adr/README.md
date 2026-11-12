# Architecture Decision Records (ADRs)

Jede wesentliche Architektur- oder Technologieentscheidung wird als ADR festgehalten.
ADRs werden nicht nachträglich umgeschrieben. Eine geänderte Entscheidung bekommt ein neues ADR, und das alte erhält den Status `Ersetzt durch NNNN`.

| Nr. | Titel | Status |
|---|---|---|
| [0001](0001-modularer-monolith.md) | Modularer Monolith mit Django und React | Akzeptiert |
| [0002](0002-ssr-mit-react-router.md) | Serverseitiges Rendering mit React Router (Framework-Modus) | Akzeptiert, Validierung in AP 0.4 |
| [0003](0003-hintergrundjobs-ohne-redis.md) | Hintergrundjobs ohne Redis und Celery im MVP | Akzeptiert |
| [0004](0004-authentisierung-mit-allauth.md) | Authentisierung mit django-allauth | Akzeptiert |
| [0005](0005-typescript-6.md) | TypeScript 6.0 statt 7.0 | Akzeptiert |
| [0006](0006-lizenz-agpl-3.0.md) | Lizenz AGPL-3.0 | Akzeptiert, vor dem Öffentlichschalten erneut prüfen |

## Vorlage

```markdown
# NNNN – Titel

- Status: Vorgeschlagen | Akzeptiert | Ersetzt durch NNNN
- Datum: JJJJ-MM-TT

## Kontext
## Entscheidung
## Alternativen
## Konsequenzen
## Quellen
```
