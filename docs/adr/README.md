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
| [0007](0007-visual-direction-developer-workbench.md) | Visual direction: Developer Workbench (concept A) | Accepted (direction) |
| [0008](0008-design-system-implementation.md) | Design system implementation: CSS tokens, CSS Modules, self-hosted assets | Accepted |
| [0009](0009-account-rules-and-password-policy.md) | Account rules and password policy | Accepted; password length re-assessed before going public |
| [0010](0010-image-upload-pipeline.md) | Image upload pipeline (avatars first) | Accepted |
| [0011](0011-two-factor-authentication.md) | Two-factor authentication | Accepted |
| [0012](0012-github-login.md) | GitHub login | Accepted |
| [0013](0013-account-deletion-and-data-export.md) | Account deletion and personal data export | Accepted |
| [0014](0014-spdx-licence-catalog.md) | Licence catalog from the SPDX License List | Accepted |
| [0015](0015-repository-verification.md) | Repository verification (check file, one-time GitHub authorization) | Accepted |
| [0016](0016-campaigns-and-status-model.md) | Campaigns and status model | Accepted |
| [0017](0017-download-links-and-warning-page.md) | Download links and warning page | Accepted |
| [0018](0018-platform-roles.md) | Platform roles (admin, moderator) | Accepted |
| [0019](0019-reporting-and-link-suspension.md) | Reporting and automatic link suspension | Accepted |
| [0020](0020-moderation-and-blocking.md) | Moderation and blocking | Accepted |
| [0021](0021-review-of-public-campaigns.md) | Review of public campaigns | Accepted |
| [0022](0022-rate-limits-and-shared-cache.md) | Rate limits and the shared cache | Accepted |
| [0023](0023-test-methods-tasks-and-progress.md) | Test methods, tasks and progress | Accepted |
| [0024](0024-feedback.md) | Feedback | Accepted |
| [0025](0025-discover.md) | Discover | Accepted |

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
