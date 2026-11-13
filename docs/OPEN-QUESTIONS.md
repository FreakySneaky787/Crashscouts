# Open Questions

> As of: 2026-11-13. Every question is clarified **before** the phase that needs it. Until then,
> nothing that depends on it is implemented.
> The "Proposal" column is a recommendation, **not** a decision.

## Product

| # | Question | Due | Proposal |
|---|---|---|---|
| A | Waiting period for new accounts before they may submit public campaigns | phase 3B | 7 days plus verified email plus 2FA, or manual approval by an admin |
| G | Contribution model: DCO or CLA | before going public | DCO |
| H | Who moderates initially? | phase 3B | the project owner only |
| J | Code of conduct | before going public | an established template, chosen by the project owner |
| K | Final product name, logo, domain | open | decided exclusively by the project owner |
| W | Invitation rules set provisionally in WP 3A.5 (conservative): the whole project team invites; only published, running private campaigns; invitations expire after 14 days; at most 100 open per campaign; 50 per day and person; removed participants cannot be invited again. Added in WP 3A.4a: joining directly needs a confirmed email; team members do not join their own campaigns; removal is final for that campaign; the removal email has no reason text | confirm with the owner | keep as is |
| T | Store IP addresses in the audit log? | phase 3B | not stored so far (data minimisation); for abuse handling consider a truncated or keyed-hash IP with a short retention period |
| N | HSTS `includeSubDomains` and `preload` | after choosing the domain | enable only once all subdomains are permanently HTTPS-only |

### Resolved

| # | Question | Decision (2026-11-12) |
|---|---|---|
| B | Repository verification | **Two ways:** a file with a check code in the repository, on **GitHub, GitLab.com and Codeberg** (2026-11-13), or, for GitHub projects, a **one-time GitHub authorization** whose token is revoked at once and never stored. Public repositories only ([ADR 0015](adr/0015-repository-verification.md)). |
| C | Campaign status | **Hard limit** for the desired number of testers (automatically "Full"); **"In Progress" automatically from the start date**; **"Completed" only by hand** (2026-11-13). Stored are only the team's decisions; the visible status is derived ([ADR 0016](adr/0016-campaigns-and-status-model.md)). |
| – | Private campaign invitations | **By username only**, accepted by the invited person (like project teams); no shareable links, no invitations to email addresses (2026-11-13). |
| – | Download links | **Any `https` link**, behind a warning page that shows the target and whether it lies in the verified repository; visible **only to the team and participants** (2026-11-13). |
| – | What participants see | **The team sees participants** (username and the profile details they made visible); everyone else sees only the number (2026-11-13; completes D). |
| – | Applications | **Per-campaign questions** set by the team, with templates; default "short message, optional" (2026-11-13). |
| – | Notifications in phase 3A | **Email plus a notice on the account page**; a notification centre comes later (2026-11-13). |
| – | Ending a participation | Testers may **leave**; the team may **remove** participants (2026-11-13). |
| – | Campaign start and end | **Date, time and time zone** chosen by the team (default Europe/Zurich); shown in that zone (2026-11-13). |
| – | Checksums for download links | **Optional SHA-256** per link, shown on the warning page with instructions (2026-11-13). |
| – | Campaign URL | **`/p/<project>/c/<campaign>`** with redirects after renaming (2026-11-13). |
| V | Team rules | **Confirmed by the owner (2026-11-13):** only the owner invites, removes and hands over; maintainers may leave; invitations expire after 14 days; at most 20 pending per project; 30 invitations per day. |
| – | Project visibility | **Public or private**, chosen per project; private projects are visible only to owner, maintainers and (later) invited testers, 404 for everyone else. |
| – | Who may create projects | **Every account with a confirmed email address**, with a daily limit; abuse is handled by reporting and blocking (phase 3B). |
| – | Adding maintainers | **Invitation that the person must accept**; nobody is added to a project without consent. |
| – | Project when the owner's account is deleted | **Handed over** to the longest-serving maintainer (with email); without maintainers the project is deleted. Owners are told during the 14-day grace period and can hand over earlier. |
| – | Format of project descriptions | **Markdown with a fixed allowlist** (headings, lists, links, code; no raw HTML, no images from other servers). |
| – | Project URL | **`/p/<project-name>`**: a readable, unique short name chosen at creation; old names redirect after a rename. |
| F | Provider for transactional email | **Scaleway Transactional Email** (France; free allowance, then pay per use – owner's constraint: free or very cheap). Development and CI use Mailpit; the code speaks provider-neutral SMTP. Limits and prices are verified on the official pages before signing up. |
| D | Default visibility of profiles | **Minimally public:** username and initials avatar; bio, interests, operating systems and skills optional and individually switchable; email never visible; profiles not indexed unless the user opts in. What participants see of each other is decided in phase 3A. |
| L | Password rules | **Minimum 12 characters**, at least 64 allowed, no composition rules, blocklist of common passwords, similarity check against username/email. Deliberately below NIST SP 800-63B-4 (15 characters for single-factor passwords); recorded in [ADR 0009](adr/0009-account-rules-and-password-policy.md). |
| M | Login and email uniqueness | **Login with email only**; one account per email, case-insensitive; separate unique public username (case-insensitive) for profiles. |
| – | GitHub login with an email that already exists | **No automatic linking.** The user signs in normally and connects GitHub in the settings (allauth default `SOCIALACCOUNT_EMAIL_AUTHENTICATION=False`). |
| – | 2FA methods in phase 1 | TOTP, passkeys/security keys and recovery codes; **plus passwordless passkey login**. 2FA stays optional. |
| – | Account deletion | **14-day grace period:** the account is deactivated and invisible immediately, restorable by signing in, deleted after 14 days; feedback is anonymized, not deleted. |
| E | Visual direction | **Concept A – Developer Workbench**, with light/dark mode in the product UI ([ADR 0007](adr/0007-visual-direction-developer-workbench.md)). Implemented as the design system ([`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md), [ADR 0008](adr/0008-design-system-implementation.md)). |
| I | Language of the repository documentation | **English** for all documentation, code comments and commit messages. The original master prompt stays available in German as [`MASTER-PROMPT.de.md`](MASTER-PROMPT.de.md). |

## Legal (not legal advice; have it reviewed before the beta)

- As a private individual, the operator must state their identity and contact details in the
  privacy policy (FADP art. 19 para. 2 lit. a; GDPR art. 13). These details become public.
- The GDPR presumably applies in addition, because the service targets people in the EU (GDPR
  art. 3 para. 2).
- Whether an EU representative under GDPR art. 27 is required must be checked; exceptions apply to
  occasional, low-risk processing.
- The terms of use need a disclaimer for links to third-party software and a reporting procedure.
- AGPL-3.0: the hosted version must link to its source code (footer).
- The SPDX License List data (identifiers, names, OSI flag) is used without a stated data licence
  in the SPDX repositories; confirm in the legal review ([ADR 0014](adr/0014-spdx-licence-catalog.md)).

Sources: [FADP (Fedlex)](https://www.fedlex.admin.ch/eli/cc/2022/491/de) ·
[GDPR (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

## Technical

| # | Topic | Due |
|---|---|---|
| O | Shared Django cache for allauth rate limits (the default per-process memory cache is insufficient with several processes), e.g. the database cache | before phase 3B / beta |
| P | Behind the TLS proxy, the SSR server must see the public origin (host and `https`), because React Router rejects actions whose `Origin` does not match the request URL. Configure via a custom server with trusted proxy headers or `allowedActionOrigins`, and cover it with an E2E test against the production-like setup | WP 0.5 / phase 8 |
| U | Try the real GitHub login with the owner's OAuth app (callback already set to `http://localhost:3000/accounts/github/login/callback/`) | first test server with a real domain | owner's decision (2026-11-12): test on the first test server; then add that server's callback URLs to the same OAuth app: the login callback and, since WP 2.5, `<frontend>/projects/github/verify/callback` for the repository verification (ADR 0015). On that occasion also confirm that GitHub returns `permissions` for a token without scopes and that Codeberg answers the Gitea API v1 endpoints. Nothing to do until then. |
| R | Confirm the dev container in a real GitHub Codespace: features (Node 24, GitHub CLI, Claude Code), full `post-create.sh` including Playwright's Chromium, private port forwarding, `pnpm e2e` | before phase 1 (needs one Codespace start by the project owner) |
| S | Evaluate pnpm 12 (major upgrade from 10.x) | when convenient |
| Q | Remove `apps.ssr_probe` and the probe routes once the regression tests have moved to the real models | phase 2/3 |
| – | Hosting provider (Switzerland/EU) and object storage | phase 8 |
| – | Dependabot started about ten update runs at once on the first push; check whether these count against the free Actions quota | after the first billing overview |
| – | `minimatch` moderate advisory (GHSA-g3hv-75wg-m249) via ESLint (dev only) | next ESLint update |
| – | Measure the real CI duration per run and re-check it against the free Actions quota | after the first runs |
| – | Upgrade to Django 6.2 LTS (planned for April 2027) | after release |
| – | Switch to TypeScript 7 once typescript-eslint supports it | ongoing |
| – | drf-spectacular 0.30.0 and pytest-django 4.14.0 officially declare Django only up to 6.0; they work with 6.1.3 in our tests. Watch on updates | ongoing |
