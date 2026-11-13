# Development Status

> This file describes the **actual** state. It is updated with every completed work package.
> Only what has demonstrably been verified counts as done.

**Last update:** 2026-11-13 (WP 3A.3) · **Current phase:** 3A – Campaigns

## Work packages

| WP | Status | Evidence |
|---|---|---|
| 0.1 Attach repository, inspect environment | ✅ done | see below |
| 0.2 Documentation skeleton | ✅ done | docs match the approved plan; gitleaks clean |
| 0.3 Backend skeleton | ✅ done | tests green against PostgreSQL 18.6; Ruff clean; OpenAPI validated |
| 0.4 Frontend skeleton and SSR auth spike | ✅ done | **all six SSR criteria pass** (Playwright); vitest, ESLint, tsc clean |
| 0.5 Dev container and setup script | ◐ done, Codespaces check pending | dev container image + backend setup verified with Docker; cloud setup script verified; a real Codespace start is still to be confirmed (open question R) |
| 0.6 CI and pre-commit | ✅ done locally; first GitHub run see below | hook tested (blocks a fake token, passes clean commits, Docker fallback); workflow YAML valid; gitleaks history scan and pip-audit clean |
| 0.7 Playwright skeleton | ◐ largely pulled forward into WP 0.4 | CI integration follows in WP 0.6 |

## Results of WP 0.1 (2026-11-12)

- Repository `FreakySneaky787/testhub`: private, default branch `main`, initially empty.
- **Claude cloud environment:** Ubuntu 24.04, 4 CPUs, 15 GB RAM.
  - Preinstalled: Python 3.13.18, Node 22.23.4, pnpm 10.28.0, uv 0.11.32, Docker CLI 29.9.2 with
    Compose v5.6.1.
- **Docker daemon:** starts in the cloud environment (manual `dockerd` start). Background processes
  are stopped after their time limit, so the daemon may need restarting.
- **PostgreSQL:** the official image `postgres:18` yielded PostgreSQL **18.6**; read/write test
  passed, port bound to `127.0.0.1` only.
- **Note:** the environment uses cgroup v1. Docker reports that support ends by May 2029 at the
  latest; uncritical for development.

## Results of WP 0.2 (2026-11-12)

- Documentation under `docs/`, ADRs 0001–0006, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` (draft),
  `SECURITY.md` (provisional) and `LICENSE`.
- The `LICENSE` text (AGPL-3.0) comes from GitHub's license template (choosealicense.com) and was
  checked against the SPDX license list; the only difference is `https` instead of `http` in three
  FSF URLs.
- gitleaks v8.30.1 was built from the Go module proxy with checksum verification.

## Results of WP 0.3 (2026-11-12)

- **Backend under `backend/`:** Python 3.14.6, Django 6.1.3, DRF 3.18.3, drf-spectacular 0.30.0,
  psycopg 3.3.9, argon2-cffi 25.1.0; pytest 9.2.0, pytest-django 4.14.0, Ruff 0.17.4; all pinned in
  `backend/uv.lock`.
- Split settings (dev, test, prod), configuration from environment variables only; custom user
  model and base models with UUIDv4 primary keys; Argon2; API authenticated by default.
- `GET /api/v1/health/` checks the database, returns 503 without details on failure, sets
  `Cache-Control: no-store`.
- Production settings refuse to start without a strong `DJANGO_SECRET_KEY` and
  `DJANGO_ALLOWED_HOSTS`; secure cookies, HTTPS redirect and HSTS.
- `compose.yaml` with `postgres:18`, pinned by digest, bound to `127.0.0.1`.
- Mutation checks: three deliberately introduced defects were each caught by the tests.

## Results of WP 0.4 (2026-11-12)

- **Frontend under `frontend/`:** React 19.3.1, React Router 8.5.1 (framework mode, SSR), Vite
  8.3.8, TypeScript 6.0.3, react-i18next 18.0.1 / i18next 27.1.1, Vitest 5.1.0, ESLint 10.14 with
  typescript-eslint 8.72.2; pinned in `frontend/pnpm-lock.yaml`.
- **Backend additions:** django-allauth 65.22.0 headless (browser client only; login, logout and
  session; signup disabled); `CSRF_TRUSTED_ORIGINS`; test-only `apps.ssr_probe` (production
  settings refuse to start if it is installed).
- **E2E under `e2e/`:** Playwright 1.65.0 against Django and the **production** SSR build.
- **Verification (run on 2026-11-12):**
  - `pytest`: 39 passed (PostgreSQL 18.6), including probe permissions (404 for strangers and
    anonymous users), CSRF enforcement and allauth login/logout.
  - `vitest`: 31 passed (cookie parsing, cache headers, open-redirect protection, UUID validation,
    per-request i18n instances).
  - Playwright: **8 passed** – the six acceptance criteria plus security headers/CSP and "no logout
    via GET".
  - ESLint, `tsc`, Ruff: clean. gitleaks: clean.
  - Mutation checks: making session pages publicly cacheable, and making the private probe object
    visible to everyone, were each caught by the E2E suite.
- **Finding:** React Router 8 rejects actions from a foreign `Origin` itself (400) – an additional
  CSRF layer in front of Django's checks. The E2E suite verifies both layers separately. This has a
  consequence for the production setup (open question P).

## Results of WP 0.5 (2026-11-12)

- **Dev container** (`.devcontainer/`): official image `mcr.microsoft.com/devcontainers/python:3-3.14-trixie`
  (Python 3.14.10), features Node 24, GitHub CLI and Claude Code (`claude-code:1.0`), non-root user
  `vscode`, named volume for Claude Code's configuration, ports 5173/8000 forwarded (private),
  PostgreSQL shared via `network_mode: service:db` without an extra port. `initialize.sh` creates a
  local `.env` with a random database password; `post-create.sh` installs the pinned tools and all
  dependencies and migrates.
- **Pinned tool versions:** uv 0.13.7 (accepts the existing `uv.lock` unchanged) and pnpm 10.34.9
  (newest 10.x; `packageManager` field in `package.json`). pnpm 12 is deliberately not adopted yet.
- **Cloud setup script** `scripts/cloud-setup.sh`: installs uv, Python 3.14, pnpm and all
  dependencies; run from the checkout's parent directory exactly as at session start – exit 0.
- **Verification (run on 2026-11-12):**
  - `devcontainer.json` parses; the merged Compose configuration shows PostgreSQL bound to
    `127.0.0.1` only and no published workspace ports.
  - `initialize.sh` tested in a throwaway copy: creates a 32-character random password; second run
    is a no-op.
  - Workspace container from the official image started with Docker Compose; as user `vscode`:
    uv 0.13.7 installed, `uv sync --frozen`, migrations, **pytest 39 passed** against the shared
    database.
  - With uv 0.13.7 and pnpm 10.34.9 on the host: pytest 39, vitest 31, Playwright 8 passed; lockfiles
    unchanged.
- **Not verifiable here:** the dev container features (Node, GitHub CLI, Claude Code) and the full
  `post-create.sh`, because running the Dev Container CLI via `npx` was blocked by this
  environment's safety check. This needs one real Codespace start (open question R).

## Results of WP 0.6 (2026-11-12)

- **CI** (`.github/workflows/ci.yml`) on push to `main`, pull requests and manual trigger;
  superseded runs are cancelled. Jobs: secret scan (gitleaks v8.30.1 Docker image by digest, full
  history), backend (Ruff, pytest against `postgres:18`, migration check, OpenAPI validation,
  `pip-audit` with hashed requirements), frontend (ESLint, `tsc`, Vitest, build, `pnpm audit`
  failing on high/critical), E2E (Playwright against the production SSR build). Only the
  first-party actions `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 are used, pinned to
  commit SHAs; `permissions: contents: read`; checkout without persisted credentials.
- **Dependabot** (`.github/dependabot.yml`): uv, npm (frontend, e2e), GitHub Actions, dev containers.
- **Pre-commit hook** (`.githooks/pre-commit`, activated via `core.hooksPath` by `post-create.sh`
  and `cloud-setup.sh`): gitleaks on the staged changes (binary or Docker; **blocks the commit if
  neither is available**), Ruff for backend files, ESLint for frontend files. gitleaks is installed
  via `go install` from the Go module proxy (checksum-verified); the dev container gets the Go
  feature for this.
- **Verification (run on 2026-11-12):** hook in a throwaway clone – fake token blocked, harmless
  commit passed, Docker fallback without the binary blocked a fake token; YAML of workflow and
  Dependabot parses, all actions pinned to SHAs; gitleaks Docker scan of the full history: no
  leaks; `pip-audit` (hashed requirements): no known vulnerabilities; `pnpm audit`: e2e clean,
  frontend one **moderate** finding (see below).
- **First GitHub run:** the CI caught a real regression from WP 0.4 – the probe endpoints lacked
  OpenAPI schema annotations, so `spectacular --validate --fail-on-warn` failed (it had not been
  re-run locally in WP 0.4). Fixed with `@extend_schema`; validation passes locally with the same
  command. Lesson: always run the full CI command set locally before pushing.
- **Dependabot** started immediately on the private repository (GitHub Free), so version updates
  are available here.
- **Known finding:** `minimatch` (GHSA-g3hv-75wg-m249, moderate, denial of service) via the dev-only
  tool ESLint; not part of the shipped application. Not force-upgraded across a major version;
  left to Dependabot/ESLint updates and tracked in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).

## Design exploration (2026-11-12)

- Research on generic "AI design" patterns and on Primer, Linear, Discourse and Mozilla Protocol;
  three clickable directions built under [`design/prototypes/`](../design/prototypes/README.md)
  (open question E). Verified with axe-core: 60 checks, 0 WCAG A/AA violations, no overflow, no
  script errors.
- **Decision:** concept A (Developer Workbench) – [ADR 0007](adr/0007-visual-direction-developer-workbench.md).
  Iteration 2 of the prototype: theme switch (system/light/dark) in the product top bar, in-app
  notifications, the tester's feedback report dialog (private by default) and "Your reports" on
  the campaign page; phone fixes. Re-verified: 60 checks with 0 violations, dialog without axe
  findings, all interaction checks passed. No production UI has been changed yet.
- Iteration 3 (typography and hierarchy, the owner's feedback): fixed type scale for concept A
  (12.5 / 13.5 / 14.5 / 16 / 20 / 28 px), panel titles larger than body text, 28 px page titles,
  key figures as large tabular numbers, sentence-case labels instead of letter-spaced capitals,
  three distinct text levels. Re-verified: 60 checks, 0 violations.

## Design system (2026-11-12)

- Concept A implemented in the production frontend: [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md),
  [ADR 0008](adr/0008-design-system-implementation.md).
  - Tokens for light and dark (`app/styles/tokens.css`), CSS Modules, own component set
    (buttons, status pills, panels, page header, tabs as links, key figures, rows, identity,
    forms, empty states), app shell with sidebar, top bar and a no-JS mobile menu.
  - Theme switch system/light/dark in the top bar: cookie `theme`, rendered on the server (no
    flash), works without JavaScript.
  - New dependencies: `@fontsource/source-sans-3` 5.3.1, `@fontsource/jetbrains-mono` 5.3.0
    (OFL-1.1, self-hosted), `@phosphor-icons/react` 2.1.10 (MIT); E2E: `@axe-core/playwright`
    4.14.0 (MPL-2.0, test only).
  - Existing pages (home, login, account, probes) moved to the components; living reference at
    `/design-system`.
- **Findings during the work:** the CSP blocked fonts that Vite inlined as `data:` URIs
  (`font-src 'self'`) → fonts are excluded from inlining; a missing favicon caused a console 404 →
  neutral placeholder `favicon.svg` (not a brand mark).
- **Verification (run on 2026-11-12):** ESLint and `tsc` clean; Vitest **40 passed**; build OK;
  pytest 39 passed, Ruff clean (backend unchanged); Playwright **18 passed** (8 SSR/security + 10
  design system: axe-core WCAG 2.2 A/AA with 0 violations on three pages × light/dark × 1280/390px,
  no overflow, no console errors, theme switch with and without JavaScript, `/theme` validation,
  self-hosted fonts, no-JS mobile menu); `pnpm audit`: only the known moderate `minimatch` finding.
  Visual review of screenshots in both themes and on a phone.

## Phase 1 – Accounts (started 2026-11-12)

Decisions: [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) (D, F, L, M, GitHub linking, 2FA methods,
account deletion) and [ADR 0009](adr/0009-account-rules-and-password-policy.md). Work packages:
[`MVP-PLAN.md`](MVP-PLAN.md).

### WP 1.1 – Account core (2026-11-12) ✅

- **Backend:** login by email only; email and username unique case-insensitively (database
  constraints); username rules and reserved names; password validators (12 to 256 characters,
  blocklist, no numeric-only, similarity); signup form with 16+ self-declaration (timestamp only);
  mandatory email verification; email links to the SSR frontend (`FRONTEND_URL`, https enforced in
  production); no account enumeration and no mail to unknown addresses; signup switch
  `DJANGO_SIGNUP_ENABLED`; email via Django 6.1 `MAILERS` (the `EMAIL_*` settings are deprecated);
  emails name the platform, not the internal backend host.
- **Audit log** (`apps.audit`): signup, email confirmation, login, failed login, logout, password
  change and reset; append-only at the ORM level; read-only admin; no IP addresses or typed-in
  identifiers.
- **Frontend:** pages for signup, "check your inbox", email confirmation (button, not on opening
  the link), login by email, forgot password and new password; new components `Notice` and
  `CheckboxField`; backend messages are mapped to i18n texts, never shown raw.
- **Mailpit** v1.33.1 (MIT) pinned by digest in `compose.yaml`, the dev container and CI; no
  outbound calls (version check and remote CSS/fonts disabled).
- **Verification (run on 2026-11-12):**
  - pytest **77 passed** (PostgreSQL 18.6): signup, verification, login, reset, rate limit,
    enumeration protection, field rules, database constraints, audit log incl. immutability,
    production settings (mail and `FRONTEND_URL` required, https only).
  - Vitest **47 passed**; ESLint, `tsc`, Ruff (check and format) clean; migrations complete;
    OpenAPI validation passes.
  - Playwright **25 passed**, including 7 account flows with real emails through Mailpit (signup →
    confirmation → login → logout; field errors without echoing the password; no enumeration;
    reset with single-use link; invalid links; signup without JavaScript) and axe-core checks for
    the new pages in both themes and widths.
- **Findings during the work:**
  - Django 6.1 deprecates `EMAIL_*`; switched to `MAILERS` before building on it.
  - allauth used the request host ("testserver", in production the internal backend host) as the
    site name in emails; the adapter now sets the platform name and the frontend host.
  - The verification key in links is URL-encoded; handled in tests, React Router decodes it.
  - allauth's per-address cooldown also suppresses the "account already exists" notice within
    3 minutes – desired protection against mail floods; tested in E2E.
  - Rate-limit counters persist in the test cache; every test now starts with an empty cache.
  - First CI run: the reset E2E test filled "Email address" before the client-side navigation
    from `/login` to `/password/forgot` had finished (both pages have such a field), so the
    request went out empty (400). A test race, not an application bug; the test now waits for
    each navigation. Verified with repeated runs (account tests 3× in a row, then the full suite).

### WP 1.2 – Profile and privacy (2026-11-12) ✅

- Owner's decisions: fields bio (500), link (https), interests, operating systems and devices,
  testing skills; fixed lists instead of free tags; **avatar upload now**; profile URL `/u/<name>`.
- **Privacy by default:** only username and avatar are public; every other field appears only
  after its own switch is turned on; indexing only after opt-in (`noindex` otherwise). Profiles of
  unconfirmed or deactivated accounts are 404.
- **Backend:** apps `catalog` (categories, platforms, skills; seeded by a data migration, editable
  by staff) and `profiles` (profile per user, own-profile API, public profile API, avatar API);
  Pillow 13.0.0 added.
- **Avatar pipeline** ([ADR 0010](adr/0010-image-upload-pipeline.md)): size, type, magic bytes,
  pixel count before decoding, re-encoding to 256×256 WebP without metadata, random names outside
  the web root, safe delivery, 10 uploads per hour.
- **Frontend:** `/u/:username` (public, SSR), `/settings/profile` (works without JavaScript,
  multipart upload with a size check before reading the body), resource route `/avatars/:key`;
  components `CheckboxGroup` and `Avatar` with image.
- **Verification (run on 2026-11-12):** pytest **115 passed**; Vitest **52 passed**; ESLint,
  `tsc`, Ruff clean; migrations complete; OpenAPI valid; pip-audit no known vulnerabilities;
  Playwright **30 passed** (5 new: privacy by default incl. hidden fields absent from the HTML,
  https-only links, real avatar upload with header checks and a disguised script, login
  requirement and 404s, axe-core in light and dark).
- **Findings during the work:**
  - DRF replaces a model's URL validator with its own, so `http://` and `ftp://` links were
    accepted despite the model rule. Caught by a negative test; the https rule is now declared on
    the serializer.
  - DRF answered the SSR server's `Accept: image/*` with 406; the image view is now a plain Django
    view (found by E2E, covered by a backend test).
  - E2E race: a previous success notice was still visible after the second save; the tests now
    wait for the POST response.

### WP 1.3a – Two-factor authentication: authenticator app and recovery codes (2026-11-12) ✅

- **Backend:** `allauth.mfa` (headless) with `fido2` 2.2.1 and `qrcode` 8.2; TOTP with one step of
  tolerance and no code reuse; 10 single-use recovery codes; reauthentication only by password or
  second factor (allauth's default would also accept an emailed code); security notification
  emails; audit events `mfa.*`; passkey relying party = host of `FRONTEND_URL`
  ([ADR 0011](adr/0011-two-factor-authentication.md)).
- **Frontend:** second login step `/login/2fa`, `/reauthenticate`, `/settings/security` (QR code as
  server-rendered SVG via `uqr` 0.1.3, key for manual entry, recovery codes shown only in an action
  response); all without JavaScript.
- **Verification (run on 2026-11-12):** pytest **125 passed** (10 new 2FA tests with an
  independent RFC 6238 implementation); Vitest **54 passed**; Playwright **34 passed** (4 new:
  enable TOTP with password confirmation, wrong code, valid code, recovery code once, 2FA login
  without JavaScript, access rules and open-redirect check, axe in both themes).
- **Findings during the work:**
  - allauth counts only an explicit reauthentication for security changes, not the login itself –
    stricter than expected; the UI leads through `/reauthenticate`.
  - allauth's default reauthentication methods include an emailed code; restricted to password or
    second factor.
  - allauth's mail helper needs the current request; notification mails are sent after the commit,
    when there is none. The adapter now builds the mail context itself.
  - Passkeys need the public frontend host as relying party and do not accept IP addresses;
    `FRONTEND_URL` defaults to `localhost` (relevant for WP 1.3b).

### WP 1.3b – Passkeys and passwordless login (2026-11-12) ✅

- **Frontend:** passkeys in the browser with the standard WebAuthn JSON helpers (no extra
  library); resource route `/passkeys` forwards to allauth; "Sign in with a passkey" on `/login`,
  "Confirm with a passkey" on `/login/2fa`, add and remove on `/settings/security` (removal also
  works without JavaScript; the passkey buttons explain that they need JavaScript).
- **Local development and E2E** now open the frontend as `localhost` (WebAuthn rejects IP
  addresses); the backend stays on `127.0.0.1:8000` internally.
- **Verification (run on 2026-11-12):** pytest **126 passed** (new: registration options need a
  fresh confirmation and carry the frontend host as relying party with a discoverable credential);
  Playwright **37 passed** (3 new: add passkey after password confirmation, passwordless login,
  passkey as second factor, removal with confirmation, removed passkey rejected – with Chromium's
  virtual authenticator; JavaScript-off note; endpoint input checks).
- **Findings during the work:**
  - allauth requires the fresh confirmation already for the passkey registration options and for
    removal; a passkey or password login does not count as one.
  - With the frontend on `localhost`, browser cookies no longer reach the backend on
    `127.0.0.1:8000` directly; the SSR test that calls Django directly now sends them explicitly.
  - Several test selectors matched panel titles such as "Sign in without a password"; the tests
    now match field labels exactly.

### WP 1.4 – GitHub login (2026-11-12) ✅ (real login still to be tried)

- **Backend:** allauth `socialaccount` with GitHub (extra packages `requests` 2.34.2, `oauthlib`
  4.0.1); credentials only from `DJANGO_GITHUB_CLIENT_ID`/`_SECRET`; no automatic linking by email;
  signup form with username and 16+ confirmation; scopes `read:user`, `user:email`; tokens not
  stored; public host via `X-Forwarded-Host` ([ADR 0012](adr/0012-github-login.md)).
- **Frontend:** "Continue with GitHub" on login and signup (plain form), callback route,
  `/login/provider/callback`, `/signup/github`, connected accounts in the security settings
  (connect, disconnect); CSP `form-action` additionally allows `https://github.com`.
- **The owner created a GitHub OAuth app** (2026-11-12) with the callback URL
  `http://localhost:3000/accounts/github/login/callback/`. The real login will be tried on the
  first test server with a real domain (open question U); a cloud session is not reachable from
  the owner's browser under `localhost`.
- **Verification (run on 2026-11-12):** pytest **134 passed** (8 new with a simulated GitHub:
  not offered without credentials, public callback URL, forged state, signup with age
  confirmation, no login into an existing account with the same email, connect and log in,
  connect without session links nothing, foreign callback URL refused); Vitest **57 passed**;
  Playwright **43 passed** (6 new; GitHub is never contacted).
- **Findings during the work:**
  - allauth builds the callback URL from the request host, i.e. the internal backend host; fixed
    with the forwarded public host.
  - The CSP `form-action 'self'` blocked the redirect to GitHub after the form POST (found by
    E2E); GitHub's origin is now allowed explicitly and tested.
  - Playwright cannot intercept redirects of a navigation; the tests capture the server's
    redirect target at the form POST instead, so they never load github.com.

### WP 1.5 – Account deletion and data export (2026-11-12) ✅

- **Deletion:** password and checkbox; the account is hidden at once, all sessions end, email
  confirmation; signing in within 14 days cancels it (email, audit); `manage.py
  purge_deleted_accounts` deletes due accounts with their avatar files and records the deletion
  without personal reference ([ADR 0013](adr/0013-account-deletion-and-data-export.md)).
- **Export:** JSON download after password confirmation with all stored data about the user and no
  secrets.
- **Frontend:** `/settings/account`, `/account/export` (download), `/goodbye`; button variant
  `danger`. Everything works without JavaScript.
- **Verification (run on 2026-11-12):** pytest **145 passed** (11 new: login and password required,
  confirmation, no-password accounts, hidden and signed out everywhere, cancel by signing in,
  throttling, purge only when due incl. avatar and audit anonymity, export without secrets or other
  people's data); Playwright **47 passed** (4 new incl. a real download and the real emails).

**Phase 1 (accounts) is complete.** Still open: trying the real GitHub login on the first test
server (open question U).

## Phase 2 – Projects (2026-11-12 – 2026-11-13) ✅

Decisions: public or private projects, every confirmed account may create projects, maintainers by
accepted invitation, repository verification by file or GitHub ([`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)).

### WP 2.1 – Catalog: programming languages and licences (2026-11-12) ✅

- 23 programming languages (curated) and the official SPDX License List 3.29.0: 708 non-deprecated
  licences plus `LicenseRef-Proprietary`; "open source" = OSI-approved (141)
  ([ADR 0014](adr/0014-spdx-licence-catalog.md)). API: `/api/v1/catalog/` (now with languages),
  `/api/v1/catalog/licenses/`; command `sync_spdx_licenses` for updates.
- **Verification (run on 2026-11-12):** pytest **149 passed** (4 new: languages, licence count and
  labels incl. BUSL/SSPL not open source, deprecated identifiers absent, idempotent sync).

### WP 2.2a – Projects backend (2026-11-12) ✅

- **Model:** project (short name, name, summary, Markdown description up to 10,000 characters,
  status, public/private – default private, licence, https repository link, categories,
  platforms, languages), membership with exactly one owner (database constraint), former short
  names for redirects.
- **Permissions in one policy module:** public projects visible to all; private ones only to the
  team (404 for everyone else, also under former names); team edits, owner deletes.
- **API:** `POST /api/v1/projects/` (confirmed email, 10 per day), `GET/PATCH/DELETE
  /api/v1/projects/<slug>/`, `GET /api/v1/me/projects/`; audit events for owner change,
  deletion and visibility change.
- **Account deletion:** owned projects go to the longest-serving maintainer (email), or are
  deleted without one; the deletion email lists owned projects; the data export lists project
  memberships.
- **Verification (run on 2026-11-12):** pytest **181 passed** (32 new incl. the full permission
  matrix anonymous/stranger/maintainer/owner × public/private × view/edit/delete). Mutation
  checks: making private projects visible to all, and letting maintainers delete, were each
  caught.

### WP 2.2b – Project pages (2026-11-12) ✅

- **Pages:** `/projects/new`, `/p/<name>` (server-rendered; Open Graph and description tags for
  public projects, `noindex` for private ones; former names redirect with 301),
  `/p/<name>/edit` (team; deletion with confirmation for the owner), "Your projects" on the
  account page. Everything works without JavaScript.
- **Markdown** via `react-markdown` 10.1.0 and `remark-gfm` 4.0.1 (MIT) with an allowlist: no raw
  HTML, no images, links only http(s)/mailto; `dangerouslySetInnerHTML` stays banned.
- **Backend:** project and account endpoints return machine-readable error codes (shared helper
  `apps/core/api.py`).
- **Verification (run on 2026-11-12):** pytest **182 passed**; Vitest **66 passed** (Markdown
  safety with script, image, event-handler and `javascript:` inputs); Playwright **53 passed**
  (6 new: create with safe Markdown and link previews, private = 404 for strangers, rename with
  301, strangers cannot edit, owner deletion with confirmation, creation without JavaScript with
  field errors, axe in both themes); production build OK.
- **Findings during the work:**
  - A route module exported a helper that used server-only code; the production build refused it
    (moved to `lib/projects.server.ts`).
  - The accessible name of the visibility radio buttons contained the whole hint; the hint is now
    linked via `aria-describedby` (found by E2E).
  - The growing E2E suite hit allauth's login limit (30 per minute per IP; confirmed by 429s in
    the Django log). The development settings now have a switch `DJANGO_E2E_RELAXED_RATE_LIMITS`
    that only the E2E run sets; production and pytest keep the limits.
  - The Docker daemon of the cloud session stops after its time limit; it is now started inside
    the check commands instead of as a long-running background task.

### WP 2.3 – Project team (2026-11-12) ✅

- **Invitations:** the owner invites by username; the invitee gets an email and accepts or
  declines on the account page; private projects stay invisible until accepted; invitations
  expire after 14 days; unconfirmed accounts and accounts waiting for deletion count as "not
  found". Withdraw, remove, leave, and **hand over ownership** with password confirmation.
- **Provisional rules (open question V, to be confirmed by the owner):** only the owner invites,
  removes and hands over; at most 20 pending invitations per project; 30 invitations per day.
- **Data protection:** received invitations are part of the data export.
- **Verification (run on 2026-11-12):** pytest **197 passed** (15 new: invite/accept/decline,
  nobody else can answer an invitation, owner-only actions, error codes, expiry and renewal,
  limit, revoke, team view for the team only, removal and leaving, transfer with password).
  Mutation checks (anyone may remove members; anyone may answer an invitation) were caught.
  Playwright **57 passed** (4 new incl. the invitation email in Mailpit, handover and leaving,
  axe in both themes; the team tests also passed 3 times in a row after fixing two test races
  where a click was not awaited).

### WP 2.4 – Logo and screenshots (2026-11-12) ✅

- Shared image pipeline `apps/core/images.py` (avatars refactored onto it; all avatar tests
  unchanged and green). Logo 256×256; up to 8 screenshots, 5 MB, scaled to at most 1600 px,
  description required; files removed with their rows.
- Delivery `/project-images/<key>` checks visibility on every request (private projects: team only,
  `private, no-store`); the SSR route forwards the session for this check.
- **Verification (run on 2026-11-12):** pytest **204 passed** (7 new; mutation check "deliver
  without visibility check" caught); Playwright **58 passed** (logo, screenshot with description,
  private images 404 for anonymous visitors and strangers).
- **Findings during the work:** two fields on the edit page were both labelled "Description"
  (project and screenshot) – renamed to "Screenshot description"; another test race with a stale
  success notice, fixed by waiting for the new image itself.

### WP 2.5 – Repository verification (2026-11-13) ✅

- Owner's decisions: check file on GitHub, GitLab.com and Codeberg; for GitHub also a one-time
  authorization whose token is revoked at once ([ADR 0015](adr/0015-repository-verification.md)).
- Backend: `repositories.py` (host allowlist, strict path segments, fixed official API addresses),
  `verification.py` (no redirects, 5 s timeout, size caps, public repositories only, constant-time
  code comparison, OAuth `state` signed and bound to user, session, project and link, single use;
  `maintain` or `admin` required; token revoked also on failure), model `RepositoryVerification`
  (proof bound to the link; a new link deletes it), team-only API with 10 checks per hour per
  project, audit events `project.verified` / `project.verification_failed`, `verification_method`
  in the project data.
- Frontend: "Repository verification" panel on the edit page (plain forms, works without
  JavaScript), SSR callback `/projects/github/verify/callback`, badge "Repository verified" on the
  project page.
- **Fact checks before coding:** API formats from the official sources (GitHub OpenAPI and
  `github/docs`, GitLab docs, Gitea specification). Found on the way: OAuth apps on github.com
  accept up to 10 callback URLs (so a second callback is possible), and the token revocation uses
  basic authentication with client ID and secret.
- **Not yet verifiable here** (open question U, first test server): the `permissions` field for a
  token without scopes, and Codeberg's API (codeberg.org is not reachable from this environment).
- **Verification (run on 2026-11-13):** pytest **262 passed** (58 new, against simulated code
  hosts; 10 mutation checks all caught: host allowlist removed, redirects followed, `push` accepted
  as maintainer, no token revocation, no session nonce, no visibility check, no size cap, no team
  check, proof not bound to the link, no rate limit); Ruff, migrations and OpenAPI clean; Vitest
  **68 passed**; Playwright **62 passed** (4 new: instructions and unsupported links, GitHub start
  without scopes and without JavaScript, forged state rejected, badge appears and disappears with
  the link; axe without findings).
- **Finding during the work:** the callback first was a POST; in production the browser arrives
  from github.com, so Django's CSRF origin check would have refused it. It is now a GET like every
  OAuth callback, protected by the signed single-use `state`.

## Phase 3A – Campaigns (started 2026-11-13)

Decisions: hard tester limit, "In Progress" from the start date, completion by hand, private
invitations by username, download links for team and participants only behind a warning page,
per-campaign application questions, email plus account notices ([`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)).

### WP 3A.1 – Campaigns backend (2026-11-13) ✅

- New app `apps/campaigns`: model `Campaign` (fields from the master prompt, Markdown texts,
  platforms from the catalog, database constraints for dates, tester range and
  participation/visibility), short-name history, derived status (`status.py`), policies, services,
  API under `/api/v1/projects/<slug>/campaigns/` with publish/complete/cancel
  ([ADR 0016](adr/0016-campaigns-and-status-model.md)).
- **Public-campaign lock enforced server-side** (`PUBLIC_CAMPAIGNS_ENABLED`, default off, only
  from the environment, documented in `.env.example`).
- **Verification (run on 2026-11-13):** pytest **323 passed** (61 new: permission matrix incl.
  flag and project visibility, transitions, lock, derived status, validation codes, short names,
  daily limit); 7 mutation checks caught. One of them (policy ignoring the project's visibility)
  first slipped through because the API already hides private projects – added a direct policy
  test so the policy holds on its own. Ruff, migrations and OpenAPI clean.

### WP 3A.2 – Campaigns frontend (2026-11-13) ✅

- Pages `/p/<project>/c/new`, `/p/<project>/c/<campaign>` (status pill with icon, version, times
  in the campaign's time zone, places "x of y", Markdown sections; former names redirect) and
  `…/edit` (save, publish, complete, cancel with confirmation, delete drafts with confirmation;
  visibility and participation only while a draft). Campaign list on the project page.
- **Owner's decision:** start and end with date, time and time zone (default Europe/Zurich).
  The SSR server converts with `Intl`; the backend stores the zone and validates it against
  `tzdata` 2026.6 (new direct dependency, Apache-2.0).
- The lock for public campaigns is explained on the page and the server's refusal is shown.
- **Verification (run on 2026-11-13):** pytest **324 passed** (1 new: time zone stored and validated); Vitest **77 passed** (9 new:
  time-zone conversion incl. daylight saving time and +05:45, round trip, payload, problems);
  Playwright **68 passed** (6 new: create/publish/complete, public lock, 404 for strangers and
  visitors, validation and confirmations, without JavaScript, axe light/dark; run twice in a row
  without flakes); Ruff, migrations, OpenAPI, pip-audit clean.
- **Findings during the work:** Node lists some zones only under older names (e.g.
  `Asia/Katmandu`, `Europe/Kiev`), so the frontend validates zones through `Intl` itself instead
  of the list; every zone Node offers is accepted by the backend (checked against all 418).
  A test race (next step started before the create POST finished) fixed by waiting for the
  resulting address.

### WP 3A.3 – Download links and warning page (2026-11-13) ✅

- `CampaignLink` (label, URL, optional platform, optional SHA-256; at most 10), strict URL rules,
  team-only changes, visible to team and participants only (404 for everyone else), audit events,
  "in the verified repository" hint ([ADR 0017](adr/0017-download-links-and-warning-page.md)).
- Edit page: add and remove links; campaign page: "Downloads" panel; warning page
  `/p/<project>/c/<campaign>/download/<id>` with domain, full address, source, checksum and
  per-OS commands; no automatic forwarding. New component `ExternalButtonLink`.
- **Owner's decision:** optional SHA-256 checksum per link.
- **Verification (run on 2026-11-13):** pytest **359 passed** (35 new: visibility incl. a
  simulated participant who may read but not change, 16 unsafe URLs incl. IP, credentials, local
  names and a Cyrillic look-alike host, checksums, limit, closed campaigns, audit, repository
  hint); 7 mutation checks caught (one only after adding the simulated participant test);
  Vitest **78 passed**; Playwright **69 passed** (1 new: invalid link refused, warning page
  content and `rel`, no forwarding, 404 for stranger and visitor, removal, axe).
- **Findings during the work:** a header on the warning page (`Referrer-Policy: no-referrer`)
  was silently replaced by the site-wide `same-origin`; removed, since `same-origin` already sends
  no referrer to other sites and the link carries `noreferrer`.

## Known limitations

- GitHub Free for private repositories: no push protection and no branch protection (see
  [`SECURITY.md`](SECURITY.md), section 10).
- Signing out everywhere scans all sessions (no index from users to sessions); fine at the current
  scale, to be revisited when sessions grow (ADR 0013).
- allauth rate limits use the per-process memory cache; a shared cache is required before the beta
  (open question O).
- Unauthenticated GitHub API requests share a per-IP rate limit; many file checks for GitHub
  repositories in a short time may answer "code host not reachable" until it resets (ADR 0015).
- The design system covers the pages that exist so far; product pages (projects, campaigns, feedback) adopt it as they are built.
