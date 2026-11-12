# Architecture Decision Records (ADRs)

Every significant architecture or technology decision is recorded as an ADR.
ADRs are not rewritten after the fact: a changed decision gets a new ADR, and the old one is marked
`Superseded by NNNN`.

| No. | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with Django and React | Accepted |
| [0002](0002-ssr-with-react-router.md) | Server-side rendering with React Router (framework mode) | Accepted, **validated** in WP 0.4 |
| [0003](0003-background-jobs-without-redis.md) | Background jobs without Redis and Celery in the MVP | Accepted |
| [0004](0004-authentication-with-allauth.md) | Authentication with django-allauth | Accepted |
| [0005](0005-typescript-6.md) | TypeScript 6.0 instead of 7.0 | Accepted |
| [0006](0006-license-agpl-3.0.md) | License AGPL-3.0 | Accepted; re-check before going public |

## Template

```markdown
# NNNN – Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Alternatives
## Consequences
## Sources
```
