# Product Requirements (PRD) – Core MVP

> As of: 2026-11-12 · Status: **approved** (planning phase) · Working name at the time: "TestHub";
> the final name **"Crashscouts"** (crashscouts.org) was decided on 2026-11-15
>
> Basis: [`MASTER-PROMPT.md`](MASTER-PROMPT.md) plus the decisions made in the planning session.
> Marker **⚑** = proposal approved together with the overall plan; details are confirmed again
> before the respective phase.

## 1. Problem and goal

Open-source and independent developers struggle to find external testers. At the same time,
there are people who would like to try new software voluntarily and give feedback.
The platform brings both groups together and organizes **human** software testing: campaigns,
tasks and structured feedback.

Guiding idea: *Test software together. Make it better together.*

## 2. Target groups

| Role | Goal on the platform |
|---|---|
| Developer / maintainer | Present the project, find testers, run campaigns, manage feedback |
| Tester | Discover software, take part voluntarily, report bugs and improvements |
| Moderation / admin | Prevent abuse, handle reports |

One account can be developer and tester at the same time.

## 3. Binding framework decisions

- Open-source first; commercial and closed-source projects are allowed but clearly labeled
  (derived automatically from the SPDX license).
- Public and private campaigns.
- Testing methods: free, structured and combined.
- One central platform: no federation and no self-hosting in the MVP.
- Participation is voluntary and free of charge; no selling of user data.
- The platform itself is open source under AGPL-3.0 (see [ADR 0006](adr/0006-license-agpl-3.0.md)).
- No hosting of executables and no automatic execution of third-party software. Downloads go
  exclusively through external, official project sources.

## 4. Decisions made in the planning session

| Topic | Decision |
|---|---|
| MVP scope | **Core MVP:** accounts, projects, campaigns, test tasks, feedback, simple Discover search, reporting and moderation basics. Feed, following, discussions and recommendations follow after the closed beta. |
| Discoverability | Public pages are server-side rendered (SEO, link previews). |
| Feedback visibility | Feedback is **private by default** (reporter and maintainers). Maintainers can publish individual reports. |
| Sign-in | Email and password plus GitHub login. 2FA (TOTP, passkeys) is optional. ⚑ 2FA is mandatory for owners of public campaigns and for moderators. |
| Download protection | Multi-layered: HTTPS links only, interstitial warning page, controlled approval of public campaigns, optional proof of repository ownership. |
| Language | The UI is in English; i18n structure from day one. All documentation, code comments and commit messages are in English. |
| Minimum age | 16 years, by self-confirmation at signup. |
| Hosting | Switzerland or EU; provider chosen before the closed beta. |
| Operator | Private individual (legal implications in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)). |

## 5. Functional requirements (core MVP)

### 5.1 Accounts and profiles

- Signup with minimum-age confirmation, email verification, login and logout, password reset.
- Login with GitHub. The data model separates account and login identity so that further
  providers (Codeberg, GitLab) are possible later.
- Optional 2FA (TOTP, passkeys, recovery codes).
- Profile with username, avatar, bio, interests, preferred operating systems and technical skills.
- Privacy settings: what is publicly visible.
- ⚑ Account deletion (feedback is anonymized, not deleted) and data export (JSON).
- *After the beta:* followers and public activity.

### 5.2 Projects

- Create and edit projects with name, description, logo, screenshots, category, operating
  systems, programming languages, license (SPDX), repository link, status (Development, Alpha,
  Beta, Stable, Archived) and maintainers.
- Roles owner and maintainer.
- Optional proof of repository ownership, shown as a "verified" badge.
- Public, server-side rendered project page.
- *After the beta:* releases as separate objects, discussions.

### 5.3 Test campaigns

- Fields: title, description, project, software version, changelog, test period, desired number
  of testers, target operating systems, hardware requirements, prerequisites, testing method, test
  tasks, download links.
- Status: Draft, Open, Full, In Progress, Completed, Cancelled.
- Visibility public or private. Private campaigns are visible to invitees only and never appear
  publicly.
- Participation directly, after approval, or by invitation.
- Download links `https://` only, with an interstitial warning page before leaving the platform.
- **Public campaigns only become visible once the security gate is met** (see
  [`MVP-PLAN.md`](MVP-PLAN.md), phase 3B), and only after approval in the review queue. ⚑ If the
  links of an approved campaign change, it is reviewed again.

### 5.4 Test tasks

- Maintainers define ordered tasks.
- Status per participant: Not Started, In Progress, Completed, Blocked.

### 5.5 Feedback

- Types: Bug Report, UX Feedback, Feature Suggestion, Compatibility Report, General Feedback.
- Bug reports contain title, description, reproduction steps, expected and actual behavior,
  operating system, software version, screenshots and logs.
- Status: New, Reviewed, Confirmed, In Progress, Fixed, Verified, Duplicate, Cannot Reproduce,
  Rejected.
- Attachments only as PNG, JPEG, WebP, TXT, LOG or JSON.
- Private by default; maintainers publish individually.

### 5.6 Discover

- Search and filters by operating system, category, programming language, software type, license,
  development status and active campaigns.
- Small projects must not be systematically crowded out by popular ones. The default sort order
  is therefore "new" or "active", not popularity.

### 5.7 Reporting and moderation (basics)

- Report projects, campaigns and individual download links.
- Admins can block campaigns and projects immediately (with a reason, logged, reversible).
- Review queue for public campaigns.
- Moderation workflow with statuses and an audit log.
- Moderators get **no** blanket access to private content; only purpose-bound and logged.

### 5.8 Notifications (minimal)

- In-app and by email, only for essential events: invitation, participation approved or rejected,
  status change of one's own feedback, outcome of a moderation decision.

## 6. Non-functional requirements

- **Security and privacy:** see [`SECURITY.md`](SECURITY.md); Swiss FADP and presumably GDPR.
- **Accessibility:** target WCAG 2.2 AA.
- **Responsive**, with dark mode and light mode. The visual direction is **not decided yet**
  (open question E).
- **i18n:** all UI texts live in translation files from the start.
- **Replaceable name:** name and branding are configured centrally and not scattered through the
  code.

## 7. Explicitly out of scope

The platform does not replace GitHub, GitLab or Codeberg. It is not a CI/CD system, not a download
portal, not a paid crowdtesting agency and not a general developer forum. It does not execute
third-party software.

The core MVP also excludes: home feed, following, comments and discussions, project updates,
reputation and personalized recommendations (see [`ROADMAP.md`](ROADMAP.md)).
