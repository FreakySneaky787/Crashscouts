# MVP Plan (core MVP)

> As of: 2026-11-12 · Status: **approved**
>
> Before it starts, every work package (WP) is detailed: goal, requirements, affected components,
> implementation, dependencies, acceptance criteria, tests and definition of done.
> Open product questions are clarified first ([`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)). Current
> progress is tracked in [`STATUS.md`](STATUS.md).

## Deviation from the original phase order

The phases from the master prompt were reordered with the project owner's approval:

- Feed, following, discussions and recommendations come **after** the closed beta.
- The **moderation basics** come **before** public campaigns (security gate, phase 3B).
- Reason: external download links to unknown software are the biggest abuse vector. Protective
  measures must not lag behind the features they protect.

## Phase 0 – Foundation

| WP | Content | Acceptance criterion |
|---|---|---|
| 0.1 | Attach repository, inspect environment | Report: what runs, which versions |
| 0.2 | Documentation skeleton, ADRs 0001–0006, `CLAUDE.md`, `LICENSE`, repository basics | Docs match the plan; gitleaks finds nothing |
| 0.3 | Backend skeleton: Django 6.1, custom user, split settings, health endpoint, OpenAPI, pytest | `pytest` green against PostgreSQL 18 |
| 0.4 | Frontend skeleton and **SSR auth spike** (see below) | all six SSR criteria green, automated |
| 0.5 | Dev container and Compose, setup script for the Claude cloud environment | startup in Codespaces and in a cloud session documented and verified |
| 0.6 | CI: lint, typecheck, tests, gitleaks, audits, schema check; Dependabot; pre-commit | CI green |
| 0.7 | Playwright skeleton with smoke test | E2E smoke test green in CI (largely pulled forward into WP 0.4) |

### WP 0.4 – SSR auth spike: acceptance criteria

Besides React Router SSR, TypeScript 6, i18n, `brand.ts` and Vitest, the spike includes a minimal
allauth login (username and password) and a ⚑ **test-only probe app** with one public and one
private probe object. The probe app is never installed in production, so the real data model is
not fixed prematurely.

1. A public page is server-side rendered.
2. A signed-in user opens a protected page.
3. The session survives several navigations and a reload; `Set-Cookie` and CSRF work for login,
   logout and a write action.
4. A private object returns **404** to strangers and anonymous users, via SSR and via the API.
5. Private SSR responses carry `Cache-Control: private, no-store` and `Vary: Cookie`; public
   anonymous pages set no session cookies.
6. `curl` without JavaScript receives complete HTML with title and Open Graph tags.

**Only then does the SSR architecture count as validated.** If anything fails, work stops and
alternatives are presented. The tests are moved to the real models in phases 2 and 3 and remain as
regression tests.

**Result (2026-11-12): all six criteria pass** – see [`STATUS.md`](STATUS.md).

## Phase 1 – Accounts

- Signup (16+), email verification, login and logout, password reset.
- GitHub login.
- Optional 2FA (TOTP, passkeys, recovery codes).
- Profile and privacy settings.
- ⚑ Account deletion and data export.
- Audit log foundation.
- Decisions: see [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) (D, F, L, M and the resolved phase 1
  items) and [ADR 0009](adr/0009-account-rules-and-password-policy.md).

| WP | Content | State |
|---|---|---|
| 1.1 | Account core: email login, public username, password rules, signup with 16+ confirmation, email verification (Mailpit), password reset, audit log foundation | ✅ done |
| 1.2 | Profile and privacy settings (minimally public by default), avatar upload | ✅ done |
| 1.3a | 2FA: authenticator app (TOTP), recovery codes, second login step, password confirmation | ✅ done |
| 1.3b | Passkeys and passwordless passkey login | ✅ done |
| 1.4 | GitHub login, linking only manually (the owner creates a GitHub OAuth app) | ✅ done (real login with the owner's app still to be tried) |
| 1.5 | Account deletion with a 14-day grace period, data export (JSON) | ✅ done |

## Phase 2 – Projects

- Create and edit projects.
- Taxonomies, SPDX license with "open source" or "proprietary" label.
- Manage maintainers.
- Screenshots through a secure upload pipeline.
- Repository verification (B).
- Public SSR project page with meta and Open Graph tags.

Work packages (decisions 2026-11-12: public or private projects, every confirmed account may
create projects, maintainers by accepted invitation, repository verification by file or GitHub).
**Phase 2 is complete** (2026-11-13):

| WP | Content | State |
|---|---|---|
| 2.1 | Catalog: programming languages, SPDX licences from the official SPDX list (open-source label from OSI approval) | ✅ done |
| 2.2a | Projects backend: model, permissions (owner/maintainer, public/private with 404), API, short names with redirects, daily limit, export/purge integration (handover to maintainers) | ✅ done |
| 2.2b | Projects frontend: create/edit pages, public SSR page with Open Graph and Markdown (allowlist), my projects | ✅ done |
| 2.3 | Maintainer invitations (invite by username, accept/decline, leave, remove), ownership handover | ✅ done |
| 2.4 | Logo and screenshots via the image upload pipeline (ADR 0010) | ✅ done |
| 2.5 | Repository verification: check file (GitHub, GitLab.com, Codeberg) or one-time GitHub authorization ([ADR 0015](adr/0015-repository-verification.md)) | ✅ done (real GitHub check on the test server still to be tried) |

## Phase 3A – Campaigns (public visibility locked) ✅ complete (2026-11-13)

- Private campaigns complete; public campaigns as drafts only.
- Status machine (C).
- Download links with interstitial warning page.
- Invitations.
- Participation directly or after approval.
- Minimal notifications.
- Feature flag `PUBLIC_CAMPAIGNS_ENABLED=false`, enforced server-side and tested.

Work packages (decisions 2026-11-13, see [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)):

| WP | Content | State |
|---|---|---|
| 3A.1 | Campaigns backend: model, derived status, permissions, API, server-side lock for public campaigns ([ADR 0016](adr/0016-campaigns-and-status-model.md)) | ✅ done |
| 3A.2 | Campaigns frontend: create, edit, campaign page `/p/<project>/c/<campaign>`, list on the project page; start/end with time zone | ✅ done |
| 3A.3 | Download links (https only, optional SHA-256) with warning page, visible to team and participants only ([ADR 0017](adr/0017-download-links-and-warning-page.md)) | ✅ done |
| 3A.4a | Participation: join directly, leave, removal by the team, hard limit under concurrency, participant list for the team, email and account page | ✅ done |
| 3A.4b | Applications with per-campaign questions (templates, default "short message, optional"), approval and rejection; answers deleted on rejection, leaving, removal and 30 days after the campaign ends; **data foundation for the metrics** (`published_at`, `completed_at`, `cancelled_at`, `published_by`) | ✅ done |
| 3A.5 | Private invitations by username; participation through acceptance (done before 3A.4 at the owner's request) | ✅ done |
| 3A.6 | Data export and deletion, E2E for the lock, documentation (`DATABASE.md`); phase 3A complete | ✅ done |

## Phase 3B – Security gate (mandatory before any public campaign)

The gate is met only when **all** items are implemented and tested. Only then is the flag switched,
and only by the project owner. State 2026-11-13: all items implemented and tested; the operations
items before switching are in [`GATE-CHECKLIST.md`](GATE-CHECKLIST.md).

1. **Reporting:** projects, campaigns and individual download links (reason, free text, rate
   limit). Invitees of private campaigns can report too.
2. **Blocking by admins:** campaigns and projects are hidden immediately, and links are no longer
   served, not even to participants. The block has a reason, is logged and is reversible.
3. **Rate limiting** per user and IP for login, signup, reset, reports, campaign creation,
   invitations and uploads; tested.
4. **Verified email** is required to create campaigns and to report.
5. **Controlled approval:** every new public campaign goes through a review queue. ⚑ Changes to
   the download links of an approved campaign trigger a new review.
6. **Moderation workflow:** queue with the statuses open, in review, resolved and dismissed;
   actions hide, block and warn; feedback to the reporter; audit log; moderation pages in the app.
7. Waiting-period and 2FA rule for owners of public campaigns (A).
8. E2E test "abuse case": submit, review, approve, report link, block; afterwards the link is no
   longer reachable.

Work packages (decisions 2026-11-13: A email + 2FA without waiting period, H owner moderates,
roles on an admin page, standard report reasons, feedback to reporters, database cache):

| WP | Content | State |
|---|---|---|
| 3B.1 | Platform roles (admin, moderator) with 2FA requirement and admin page ([ADR 0018](adr/0018-platform-roles.md)) | ✅ done |
| 3B.2 | Reporting of projects, campaigns and download links; automatic suspension of links after 3 malware reports ([ADR 0019](adr/0019-reporting-and-link-suspension.md)) | ✅ done |
| 3B.3 | Moderation queue, blocking (blocked content and links served to no one), warnings, appeals, feedback to reporters ([ADR 0020](adr/0020-moderation-and-blocking.md)) | ✅ done |
| 3B.4 | Review queue for public campaigns; link changes trigger a new review; rule A on submission ([ADR 0021](adr/0021-review-of-public-campaigns.md)) | ✅ done |
| 3B.5 | Database cache and rate limits per user and IP ([ADR 0022](adr/0022-rate-limits-and-shared-cache.md)) | ✅ done |
| 3B.6 | E2E abuse case (separate run with the flag on) and gate checklist for the owner ([GATE-CHECKLIST](GATE-CHECKLIST.md)) | ✅ done |

## Phase 4 – Testing

- Test tasks for the free, structured and combined methods.
- Progress per participation.
- Overview for maintainers.

Decisions of 2026-11-13 and the design: [ADR 0023](adr/0023-test-methods-tasks-and-progress.md).

| WP | Content | State |
|---|---|---|
| 4.1 | Backend: testing method, test tasks, progress per participation, team overview API | ✅ done |
| 4.2 | Team pages: choose the method, maintain tasks; tasks on the campaign page | ✅ done |
| 4.3 | Testers report status and notes per task; progress on the account page | ✅ done |
| 4.4 | The team's progress overview (participants × tasks) | ✅ done |

## Phase 5 – Feedback

- Five types with type-specific fields.
- Secure attachments.
- Status workflow.
- Private by default, publishable individually.
- Maintainer inbox.

> Phase 5 requirement from WP 1.5: `purge_deleted_accounts` must anonymise feedback of deleted
> accounts instead of deleting it, and the data export must include the user's own feedback
> ([ADR 0013](adr/0013-account-deletion-and-data-export.md)). Done in WP 5.1 (author SET_NULL,
> export); attachments of deleted accounts are deleted in WP 5.2.

Decisions of 2026-11-14 and the design: [ADR 0024](adr/0024-feedback.md).

| WP | Content | State |
|---|---|---|
| 5.1 | Backend: feedback types, permissions, status workflow, publishing with consent, author emails, export and anonymisation | ✅ done |
| 5.2 | Backend: secure attachments (images re-encoded, text download only) | ✅ done |
| 5.3 | Testers give and follow feedback | ✅ done |
| 5.4 | The team's feedback inbox | ✅ done |
| 5.5 | Published feedback and wrap-up of phase 5 | ✅ done |

## Metrics (after phase 5)

Growth metrics decided by the owner on 2026-11-13 ([`METRICS.md`](METRICS.md)): Time to First
Tester, Campaign Completion Rate, Useful Feedback Rate, Returning Testers, Returning Developers.
Own data only, aggregates only, internal.

| WP | Content | State |
|---|---|---|
| M.1 | Internal statistics page for platform admins with the five metrics per month (aggregate queries, tests with fixed example data) | planned |

## Phase 6 – Discover

- PostgreSQL full-text search with filters.
- Fairness rule: default sort by new or active instead of popularity.

Decisions of 2026-11-14 in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

| WP | Content | State |
|---|---|---|
| 6.1 | Software type: catalog list and project field | ✅ done |
| 6.2 | Discover API: full-text search, filters, sort, open-source default, paging ([ADR 0025](adr/0025-discover.md)) | ✅ done |
| 6.3 | Discover page with tabs, filters and paging | planned (next) |

## Phase 7 – Extend moderation and security review

- Reporting of users and published feedback.
- Account suspensions with deadlines, appeals.
- Several moderators with purpose-bound, logged access.
- Statistics.
- Security review against OWASP ASVS level 1.

## Phase 8 – Release (closed beta)

- Integration, performance and accessibility testing.
- Legal texts and legal review.
- Hosting decision and production setup.
- Tested backup restore.
- Make the repository public.
- Closed beta.

## Acceptance criteria for the core MVP

- All core flows are green as E2E tests in CI.
- The permission matrix is fully tested, including negative cases for private campaigns and
  private feedback.
- No open high or critical findings from audits and the ASVS L1 review.
- Backup restore is tested and documented.
- Legal texts exist and have been reviewed.
- `STATUS.md` and the documentation match the implementation.
