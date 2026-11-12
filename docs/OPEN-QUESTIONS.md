# Open Questions

> As of: 2026-11-12. Every question is clarified **before** the phase that needs it. Until then,
> nothing that depends on it is implemented.
> The "Proposal" column is a recommendation, **not** a decision.

## Product

| # | Question | Due | Proposal |
|---|---|---|---|
| A | Waiting period for new accounts before they may submit public campaigns | phase 3B | 7 days plus verified email plus 2FA, or manual approval by an admin |
| B | Method of repository verification | phase 2 | token file in the repository (independent of the code host), plus a check via GitHub OAuth |
| C | Is `target_testers` a hard limit (automatically "Full")? When does the status switch to "In Progress"? | phase 3A | hard limit for direct participation; "In Progress" from `starts_at` |
| D | What do participants see of each other? Default visibility of profiles | phase 1 / 3A | participants do not see each other; profiles minimally public by default |
| E | **Visual direction, component library, styling** | before phase 1 | present 2–3 directions as mockups; the project owner decides |
| F | Provider for transactional email (Switzerland/EU) | phase 1 | Mailpit or console in development; provider before the beta |
| G | Contribution model: DCO or CLA | before going public | DCO |
| H | Who moderates initially? | phase 3B | the project owner only |
| J | Code of conduct | before going public | an established template, chosen by the project owner |
| K | Final product name, logo, domain | open | decided exclusively by the project owner |
| L | Password rules (minimum length etc.) | phase 1 | define with signup; Django defaults until then |
| M | Is the email address unique per account, and how is letter case handled? | phase 1 | decide together with the allauth setup |
| N | HSTS `includeSubDomains` and `preload` | after choosing the domain | enable only once all subdomains are permanently HTTPS-only |

### Resolved

| # | Question | Decision (2026-11-12) |
|---|---|---|
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

Sources: [FADP (Fedlex)](https://www.fedlex.admin.ch/eli/cc/2022/491/de) ·
[GDPR (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

## Technical

| # | Topic | Due |
|---|---|---|
| O | Shared Django cache for allauth rate limits (the default per-process memory cache is insufficient with several processes), e.g. the database cache | before phase 3B / beta |
| P | Behind the TLS proxy, the SSR server must see the public origin (host and `https`), because React Router rejects actions whose `Origin` does not match the request URL. Configure via a custom server with trusted proxy headers or `allowedActionOrigins`, and cover it with an E2E test against the production-like setup | WP 0.5 / phase 8 |
| R | Confirm the dev container in a real GitHub Codespace: features (Node 24, GitHub CLI, Claude Code), full `post-create.sh` including Playwright's Chromium, private port forwarding, `pnpm e2e` | before phase 1 (needs one Codespace start by the project owner) |
| S | Evaluate pnpm 12 (major upgrade from 10.x) | when convenient |
| Q | Remove `apps.ssr_probe` and the probe routes once the regression tests have moved to the real models | phase 2/3 |
| – | Hosting provider (Switzerland/EU) and object storage | phase 8 |
| – | Whether Dependabot is available for free on private repositories | WP 0.6 |
| – | Upgrade to Django 6.2 LTS (planned for April 2027) | after release |
| – | Switch to TypeScript 7 once typescript-eslint supports it | ongoing |
| – | drf-spectacular 0.30.0 and pytest-django 4.14.0 officially declare Django only up to 6.0; they work with 6.1.3 in our tests. Watch on updates | ongoing |
