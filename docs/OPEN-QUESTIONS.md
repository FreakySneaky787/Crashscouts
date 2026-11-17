# Open Questions

> As of: 2026-11-15. Every question is clarified **before** the phase that needs it. Until then,
> nothing that depends on it is implemented.
> The "Proposal" column is a recommendation, **not** a decision.

## Product

| # | Question | Due | Proposal |
|---|---|---|---|
| T | Store IP addresses in the audit log? | phase 3B | not stored so far (data minimisation); for abuse handling consider a truncated or keyed-hash IP with a short retention period |
| Y | Points marked `[TO DECIDE]` in the legal drafts (ADR 0031): ~~hosting provider and location~~ (Infomaniak, Switzerland, 2026-11-16), ~~web server logs and their retention~~ (7 days, ADR 0034), ~~backup retention~~ (7 days, ADR 0033), ~~processing agreement with Scaleway~~ (Scaleway's DPA, part of its terms), legal basis for the GitHub transfer (USA), EU representative (GDPR art. 27), SPDX data attribution, place of jurisdiction | before the beta (with the legal review) | most follow from the hosting decision; the rest for the reviewer |
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
| – | Growth metrics | **Five metrics** (Time to First Tester, Campaign Completion Rate, Useful Feedback Rate, Returning Testers, Returning Developers), defined in [`METRICS.md`](METRICS.md). **Own data only** (no tracking cookies, no third-party analytics), **internal** for platform admins, aggregates only. First tester = first participation of any kind; useful feedback = every feedback not marked Duplicate, Cannot Reproduce or Rejected. Data foundation now (WP 3A.4b), statistics page after phase 5 (2026-11-13). |
| – | Application answers | Visible to the team only; deleted at once on rejection, leaving or removal, otherwise **30 days after the campaign is completed or cancelled** (2026-11-13). |
| – | Applications when a campaign is full | **Stay open**; the team approves only when a place is free; no new applications while full; applicants may withdraw at any time (2026-11-13). |
| A | Conditions for publishing public campaigns | **Confirmed email and active 2FA, no waiting period** (2026-11-13); every new public campaign still goes through the review queue. Note: without a waiting period throw-away accounts are easier; the review queue has to catch them. |
| H | Who moderates initially | **The project owner only** (2026-11-13); moderation is built role-based so more moderators can be added later. |
| – | Assigning admin and moderator roles | **On an admin page in the app** (2026-11-13). The first admin is created once with a server command; role changes need a fresh reauthentication and 2FA, are audited, and the last admin cannot remove themselves (phase 3B). |
| – | Campaign data during the deletion grace period | Participations, invitations and applications **stay until the final deletion**; the person is hidden from team lists but keeps the place (2026-11-13). |
| O | Shared cache for rate limits | **Django's database cache in PostgreSQL** (2026-11-13): no extra service, fits ADR 0003 (no Redis in the MVP); introduced in phase 3B. Implemented in WP 3B.5 (ADR 0022); IP addresses only as HMAC hashes, at most one day (owner, 2026-11-13). |
| K | Product name and domain | **"Crashscouts"**, main address **crashscouts.org** (2026-11-15). All three of .org, .com and .ch were unregistered that day (RDAP); registering them and a trademark search (Swissreg, EUIPO) are up to the owner. Logo chosen on 2026-11-17 (the "broken C", ADR 0035); a trademark search for name and logo is up to the owner. The owner renamed the repository to `FreakySneaky787/Crashscouts` the same day. |
| G | Contribution model | **DCO** (Developer Certificate of Origin, "Signed-off-by"), no CLA (2026-11-15; set up in WP 8.7). |
| J | Code of conduct | **Contributor Covenant**, reports to the contact address (2026-11-15; set up in WP 8.7). |
| Z | GitHub profile data | **Reduced** to account number, username and profile link; older rows trimmed by migration (2026-11-15, ADR 0012 addendum). |
| – | Hosting | **Infomaniak VPS Lite**, Switzerland, 2 vCPU / 4 GB / 60 GB, CHF 7.20 per month with an annual commitment (2026-11-15; prices from the provider's page, [`PHASE-8-PLAN.md`](PHASE-8-PLAN.md)). The owner orders it; domain and the free kSuite mailbox at Infomaniak as well. |
| P | SSR behind the TLS proxy | **Resolved in WP 8.6 (ADR 0032):** Caddy sets the forwarded headers, the SSR server trusts `X-Forwarded-Proto` only with `TRUST_PROXY_HEADERS=true`, React Router's `allowedActionOrigins` holds the public host (build time); covered by the smoke tests against the production-like stack. |
| – | Production setup | **Docker Compose** (Claude's choice, delegated by the owner), **Caddy**, **Gunicorn**; performance target at beta scale: about 1,000 accounts, 20 concurrent users, 95 % of pages under 500 ms (2026-11-15). |
| X | Remediation time frames for vulnerable dependencies (ASVS 5.0 V15.1.1) | **critical 7 days, high 14 days, moderate 60 days, low 180 days** at the latest; development-only tools in the same tiers; a fix release younger than 7 days only for critical and high findings; monthly review of all dependency updates; exceptions with reason in `docs/STATUS.md`. Actively exploited critical issues are fixed as fast as possible; the frame is the upper limit (2026-11-15, [`SECURITY.md`](SECURITY.md) §10). |
| – | Suspension rules (WP 7.2) | **Confirmed:** accounts with a platform role cannot be suspended (an admin removes the role first); nobody can suspend themselves (2026-11-15, [ADR 0027](adr/0027-account-suspensions.md)). |
| – | Legal texts (2026-11-15) | Drafts by Claude, **English only**, operator = the owner **as a private individual** (details only in the server configuration), at signup a **notice only** ([ADR 0031](adr/0031-legal-texts.md)). |
| – | Phase 8 (2026-11-15) | Prices checked on the providers' pages before choosing a host; **name and domain first**, no test server before; **open registration** for the beta; legal texts drafted by Claude and reviewed by a professional. Plan, hosting comparison and name proposals: [`PHASE-8-PLAN.md`](PHASE-8-PLAN.md). |
| – | Reporting people | Reasons **spam · harassment or insults · pretending to be someone else · inappropriate profile · other**, free text optional (2026-11-14, [ADR 0026](adr/0026-moderating-people-and-feedback.md)). |
| – | Spam in published feedback | Moderators **hide** it: reversible, logged; it becomes private again and cannot be republished until the block is lifted (2026-11-14). |
| – | Account suspensions | **Read only** (sign in, read, export, delete; no creating, reporting, feedback, joining or inviting); hidden profile; reason visible, **one appeal**; **free end date or permanent**, set by **any moderator**; any moderator decides the appeal, also the one who suspended (2026-11-14; WP 7.2). |
| – | Moderators and private content | Only the reported object, only after taking the case, with a **required reason**, **valid 24 hours**, in the audit log; admins see a list of all accesses; the team is not notified (2026-11-14; WP 7.3). |
| – | Statistics in phase 7 | A **moderation statistics** page for admins; growth metrics stay in WP M.1 (2026-11-14; WP 7.4). |
| – | Discover content | **Two tabs:** public projects and public test campaigns (2026-11-14). |
| – | Software type | **New project field**, fixed choice, several possible: desktop app, mobile app, web app, command-line tool, library or framework, game, server or self-hosted, browser extension (2026-11-14). |
| – | Discover sort order | Default **"recently active"**, selectable **"new"**; never by popularity (2026-11-14). |
| – | Open source in Discover | The filter **"open source only" is preselected**; other projects appear after unticking it and are clearly labelled (2026-11-14). |
| – | Who sees private feedback | The team, the author and **all active participants** of the campaign; **attachments only the team and the author** (2026-11-14, [ADR 0024](adr/0024-feedback.md)). |
| – | Publishing feedback | **The team proposes, the author consents**; attachments stay private (2026-11-14). |
| – | "Verified" | The team sets the statuses up to "Fixed"; **the author confirms or reopens** (2026-11-14). |
| – | Feedback notifications | The team sees a **count** (no email per feedback); the author gets a **short email** on status changes and sees them on the account page (2026-11-14). |
| – | Feedback attachments | At most **5 files**, images up to **5 MB**, text up to **2 MB** (2026-11-14). |
| – | Changing feedback | The author may change or withdraw it **while it is "New"** (2026-11-14). |
| – | Feedback and test tasks | **Optional link** to a task of the campaign (2026-11-14). |
| – | Testing method | **Fixed choice** free / structured / combined; free has no tasks, structured and combined need at least one task before publishing; the free-text field stays as a hint (2026-11-13, [ADR 0023](adr/0023-test-methods-tasks-and-progress.md)). |
| – | Changing test tasks after publishing | **Allowed**; new tasks start as Not Started for everyone; a task with reported progress is **hidden, not deleted** (2026-11-13). |
| – | Notes on task statuses | **Optional short note** (at most 1000 characters), visible only to the team and the person (2026-11-13). |
| – | Task progress when someone leaves or is removed | **Kept and marked** for the team, continues on return, deleted with the account (2026-11-13). |
| – | Report reasons | **Malware or dangerous download · Deception or phishing · Someone else's software passed off as own · Spam · Legal violation (copyright, illegal content) · Other**, always with optional free text (at most 1000 characters); malware reports are shown first in the queue (2026-11-13). |
| – | Automatic suspension and report limits | Only **malware** reports act automatically: a download link is suspended after **3 different accounts** reported it, until a moderator decides. **20 reports per day**, **one open report per content** and account (2026-11-13). |
| – | Blocked content and the team | The team **keeps seeing** blocked content with the reason but cannot change it; **one appeal per block** (at most 1000 characters), decided by moderators, the team is emailed; **warnings** email the team and leave a note for moderators only, without automatic consequences (2026-11-13). |
| – | Re-review of approved public campaigns | **Only link changes** (new link, changed URL or checksum) trigger a review, and **only that link waits**; the campaign and its reviewed links stay available (2026-11-13). |
| – | Feedback to reporters | Status of their reports on the **account page** plus a **short email** when a report is closed, without details about the other side (2026-11-13). |
| W | Invitation and participation rules | **Confirmed by the owner (2026-11-13):** the whole project team invites; only published, running private campaigns; invitations expire after 14 days; at most 100 open per campaign; 50 per day and person; removed participants cannot be invited again. Added in WP 3A.4a: joining directly needs a confirmed email; team members do not join their own campaigns; removal is final for that campaign; the removal email has no reason text. |
| – | New applications | **No email per application**; the team sees "X open applications" on its pages; applicants get an email on approval or rejection (2026-11-13). |
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
| U | Try the real GitHub login with the owner's OAuth app (callback already set to `http://localhost:3000/accounts/github/login/callback/`) | first test server with a real domain | owner's decision (2026-11-12): test on the first test server. **Changed 2026-11-17:** production gets its own OAuth app (OPERATIONS §14), not the development app; its callback URLs: the login callback and, since WP 2.5, `<frontend>/projects/github/verify/callback` for the repository verification (ADR 0015). On that occasion also confirm that GitHub returns `permissions` for a token without scopes and that Codeberg answers the Gitea API v1 endpoints. Nothing to do until then. |
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
