# Data model

> State after WP 5.2 (2026-11-14). Generated from the models in `backend/apps/*/models.py`;
> update this file in the same commit as any model change.

All own tables use a random UUIDv4 primary key and `created_at`/`updated_at`
(`apps.core.models.BaseModel`); catalog entries use UUIDs without timestamps.

## Overview

```mermaid
erDiagram
  User ||--|| Profile : "CASCADE"
  User ||--o{ Membership : "CASCADE"
  Project ||--o{ Membership : "CASCADE, exactly one owner"
  Project ||--o{ Invitation : "project team, CASCADE"
  Project ||--o{ Screenshot : "CASCADE"
  Project ||--o{ SlugHistory : "CASCADE"
  Project ||--o| RepositoryVerification : "CASCADE"
  Project }o--|| License : "PROTECT"
  Project ||--o{ Campaign : "CASCADE"
  Campaign ||--o{ CampaignSlugHistory : "CASCADE"
  Campaign ||--o{ CampaignLink : "CASCADE, at most 10"
  Campaign ||--o{ CampaignInvitation : "CASCADE"
  Campaign ||--o{ Participation : "CASCADE"
  Campaign ||--o{ ApplicationQuestion : "CASCADE, at most 10"
  Campaign ||--o{ Application : "CASCADE"
  Application ||--o{ ApplicationAnswer : "CASCADE"
  Campaign ||--o{ TestTask : "CASCADE, at most 30 visible"
  Participation ||--o{ TaskProgress : "CASCADE"
  TestTask ||--o{ TaskProgress : "CASCADE"
  Campaign ||--o{ Feedback : "CASCADE"
  User ||--o{ Feedback : "author, SET_NULL"
  TestTask ||--o{ Feedback : "optional, SET_NULL"
  Feedback ||--o{ FeedbackStatusChange : "CASCADE"
  Feedback ||--o{ FeedbackAttachment : "CASCADE, at most 5"
  User ||--o{ Participation : "CASCADE"
  User ||--o{ CampaignInvitation : "invitee, CASCADE"
  User ||--o{ Application : "applicant, CASCADE"
  User ||--o{ AuditEvent : "actor/subject, SET_NULL"
```

## Tables by app

| App | Model | Purpose | Personal data and deletion |
|---|---|---|---|
| accounts | `User` | account (email login, username, age confirmation, deletion schedule, `platform_role` – ADR 0018) | deleted after the 14-day grace period (ADR 0013) |
| profiles | `Profile` | bio, link, interests, platforms, skills, avatar; `show_*` visibility per field | deleted with the account (CASCADE) |
| audit | `AuditEvent` | append-only security log | `actor`/`subject` set to NULL when an account is deleted; no IPs, no tokens |
| catalog | `Category`, `Platform`, `Skill`, `ProgrammingLanguage`, `License` | fixed lists (SPDX licences) | none |
| projects | `Project` | project with short name, visibility, licence, repository link, logo, `blocked_at` (ADR 0020) | – |
| projects | `Membership` | owner/maintainer | deleted with the account; projects are handed over first |
| projects | `Invitation` | team invitations | invitee: CASCADE; `invited_by`: SET_NULL |
| projects | `Screenshot`, `SlugHistory` | images, former short names | – |
| projects | `RepositoryVerification` | proof of repository ownership (ADR 0015) | `verified_by`: SET_NULL |
| campaigns | `Campaign` | test campaign; `method` (free, structured, combined – ADR 0023); stored state (draft, in review, published, completed, cancelled) plus `published_at`, `completed_at`, `cancelled_at`, `blocked_at`, `review_note` | `published_by`: SET_NULL (metrics, docs/METRICS.md) |
| campaigns | `CampaignSlugHistory` | former short names | – |
| campaigns | `CampaignLink` | download links (ADR 0017); suspension (ADR 0019), `blocked_at` (ADR 0020), `review_status`/`review_note` (ADR 0021) | – |
| campaigns | `CampaignInvitation` | invitations to private campaigns | invitee: CASCADE; `invited_by`: SET_NULL |
| campaigns | `Participation` | taking part (`active`/`left`/`removed`; one per person and campaign) | CASCADE with the account (frees the place) |
| campaigns | `ApplicationQuestion` | per-campaign questions | – |
| campaigns | `Application` | application (`pending`/`approved`/`rejected`/`withdrawn`) | applicant: CASCADE; `decided_by`: SET_NULL |
| moderation | `Block` | moderators' block with message, lifting and one appeal (ADR 0020) | `created_by`/`lifted_by`/`appealed_by`: SET_NULL; target: CASCADE |
| moderation | `ModerationNote` | warning to a project's team, moderators only | `created_by`: SET_NULL |
| feedback | `Feedback` | tester feedback of five kinds with type-specific fields, status, duplicate link, publishing with the author's consent (ADR 0024) | author: SET_NULL on final deletion (text stays, anonymised); in the data export |
| feedback | `FeedbackStatusChange` | status history with the role (team or author) | `actor`: SET_NULL; never shown in the API |
| feedback | `FeedbackAttachment` | screenshot (re-encoded WebP) or text file of a feedback; the file lives under a random key outside the web root (ADR 0024) | deleted with the feedback and on final account deletion (files too) |
| moderation | `Report` | report of a project, campaign or link (ADR 0019); `target_label` copy | reporter: SET_NULL; targets: SET_NULL |
| core | `rate_limit_cache` | Django's database cache for rate limits (not a model; created by migration `core/0001`, ADR 0022) | keys are HMAC hashes (no plain IP address); expired entries deleted hourly, at most one day after the last request |
| campaigns | `TestTask` | test task of a structured or combined campaign (ADR 0023); `hidden_at` when removed after progress was reported | – |
| campaigns | `TaskProgress` | a participant's status of one task with an optional note (no row = not started) | CASCADE with the participation, i.e. kept on leaving or removal, deleted with the account; in the data export |
| campaigns | `ApplicationAnswer` | answers (question text kept) | deleted on rejection, withdrawal, leaving, removal, 30 days after the campaign ends, and with the account |

## Retention jobs

Hourly:

- `manage.py purge_rate_limit_cache` – expired rate-limit entries (hashed IP addresses, ADR 0022).

Daily:

- `manage.py purge_deleted_accounts` – final account deletion after 14 days.
- `manage.py purge_application_answers` – application answers 30 days after a campaign ended.

## During the deletion grace period

Accounts scheduled for deletion are deactivated and invisible: they are not listed in project
teams, campaign participant lists or open applications, and cannot be invited. Their campaign
participations keep their places until the final deletion (owner's decision, 2026-11-13).

## Data export

`/api/v1/me/export/` (`apps/accounts/lifecycle.py::export_data`) contains everything above that
belongs to the person: account, profile, projects and team invitations, connected accounts, 2FA
method types, security log, campaign participations, campaign invitations, applications with
their own answers, the campaigns they published, their reports (with their own text), their task progress with
notes and their feedback.
