# Development Status

> This file describes the **actual** state. It is updated with every completed work package.
> Only what has demonstrably been verified counts as done.

**Last update:** 2026-11-14 (WP 5.1) · **Current phase:** 5 – Feedback (flag still off)

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

## Phase 3A – Campaigns (2026-11-13) ✅

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

### WP 3A.5 – Invitations to private campaigns (2026-11-13) ✅

Done before WP 3A.4 at the owner's request, so the path "invite privately → take part → see the
downloads" works in the real UI already.

- Models `CampaignInvitation` (pending/accepted/declined/revoked, expires) and `Participation`
  (active/left/removed; one per person and campaign). Accepting locks the campaign row and checks
  the hard limit (`status.accepts_participants`); a full campaign keeps the invitation open.
- Invited people see the published private campaign (not its links); participants also see the
  download links. Team-only list of open invitations and participants.
- API: `…/campaigns/<c>/invitations/` (GET, POST), `…/invitations/<id>/` (DELETE),
  `/me/campaign-invitations/` (+ `<id>/accept|decline/`), `/me/participations/`; email to the
  invitee after commit; audit `campaign.participant_joined`; `projects.team.invitable_user` is now
  public and shared.
- Frontend: `/p/<project>/c/<campaign>/testers` (invite, revoke, participants), "Campaign
  invitations" and "Your campaigns" on the account page, "Testers" button on the campaign page.
- **Provisional rules (WP 3A.5, to confirm with the owner, open question W):** the whole team
  invites; only published, running private campaigns; 14 days; at most 100 open invitations per
  campaign; 50 invitations per day and person; removed participants cannot be invited again.
- **Verification (run on 2026-11-13):** pytest **377 passed** (18 new: full flow incl.
  email, decline/revoke, team-only lists, invitee-only answers, who cannot be invited, duplicates,
  expiry, running private campaigns only, hard limit with the invitation kept open, closed
  campaigns, caps, rate limit); 5 mutation checks caught; Vitest **78 passed**; Playwright
  **70 passed** (1 new: invite, unknown user error, invited sees campaign but no downloads, accept
  on the account page, participant opens the download warning page, participant gets 404 on
  testers/edit, axe).
- **Not covered by an automated test:** truly concurrent accepts (the row lock is in place; a
  threaded test against PostgreSQL can be added in WP 3A.4a together with direct joining).

### WP 3A.4a – Joining, leaving, removal (2026-11-13) ✅

- `apps/campaigns/participation.py`: `activate` (shared by direct joining and accepting
  invitations; row lock, hard limit, removed people stay out), `join` (public campaigns with
  direct participation, confirmed email, not for the team), `leave`, `remove` (team; revokes open
  invitations; email after commit). Audit `campaign.participant_left/removed`.
- API: `…/join/`, `…/leave/`, `…/participants/<username>/` (DELETE, team); campaign data has
  `is_participant` (the viewer's own); the team's tester list includes each participant's public
  profile details.
- Frontend: "Take part" panel on the campaign page (join for public direct campaigns – usable
  once public campaigns are unlocked; leave with confirmation), participants with profile details
  and removal with confirmation on the testers page, account notice after leaving.
- **Provisional rules (added to open question W):** joining directly needs a confirmed email;
  team members do not join their own campaigns; removal is final for that campaign; the removal
  email carries no reason text.
- **Verification (run on 2026-11-13):** pytest **391 passed** (14 new, including a
  **threaded concurrency test** against PostgreSQL: 5 simultaneous joins for 2 places end with
  exactly 2 participants; with the row lock removed it failed 3 of 3 runs, with it it passed 5 of
  5); 4 mutation checks caught; Vitest **80 passed**; Playwright **71 passed** (1 new: leave with
  confirmation, access ends, re-invitation, removal, removed person cannot be invited, axe).

### WP 3A.4b, part 1 – Metrics foundation and question builder (2026-11-13) ✅

- `Campaign.published_at`, `completed_at`, `cancelled_at`, `published_by` (set on state
  changes; data migration from the audit log, tested) – the foundation for
  [`METRICS.md`](METRICS.md).
- `ApplicationQuestion` (short text, long text, single choice with 2–10 options, yes/no;
  required flag; at most 10; editable only in drafts of campaigns with approval); four templates,
  "short message" added automatically; API under `…/questions/`; "Application questions" panel on
  the edit page.
- Owner confirmed open question W; new applications are shown on the team's pages instead of
  emailed.
- **Verification (run on 2026-11-13):** pytest **407 passed** (16 new); 2 mutation checks
  caught (questions not frozen, anyone edits); Vitest **80 passed**; Playwright **72 passed**
  (1 new: default template, template, own choice question, validation, removal, axe).
### WP 3A.4b, part 2 – Applications (2026-11-13) ✅

- `Application` (pending/approved/rejected/withdrawn) and `ApplicationAnswer` (question text
  kept with the value); `apps/campaigns/applications.py`: apply (public campaigns with approval,
  published, not full, confirmed email, not the team, not removed or rejected people; answers
  validated against the questions), withdraw (answers deleted, re-applying allowed), approve
  (through `participation.activate`), reject (answers deleted at once, no re-application),
  `purge_answers` with the daily command `purge_application_answers`; leaving and removal delete
  the answers. Audit `campaign.application_approved/rejected`; emails to applicants only.
- API: `…/apply/`, `…/withdraw/`, `…/applications/` (team), `…/applications/<id>/approve|reject/`
  (team), `/me/applications/`; campaign data has `open_applications` (team only) and
  `my_application`.
- Frontend: application form and status on the campaign page, "Open applications" with answers,
  approve and reject (with confirmation) on the testers page, the count on the project and
  campaign pages for the team, "Your applications" on the account page. Applying is usable once
  public campaigns are unlocked (phase 3B); covered by pytest with the flag on.
- **Verification (run on 2026-11-13):** pytest **423 passed** (16 new, including a threaded test:
  4 simultaneous approvals for 1 place end with exactly 1 participant); 5 mutation checks caught
  (answers visible to all, rejection keeps answers, approval bypasses the limit, purge ignores
  the retention period, rejected may re-apply); Vitest **82 passed**; Playwright **72 passed**;
  Ruff, migrations, OpenAPI and pip-audit clean.

### WP 3A.6 – Wrap-up of phase 3A (2026-11-13) ✅

- Data export with campaign participations, campaign invitations, applications with the
  person's own answers, and campaigns they published.
- Deletion grace period (owner's decision): participations keep their places, the person is
  hidden from participant and application lists; final deletion removes all campaign data of the
  person and frees the place; `published_by`/`decided_by` become NULL; campaigns follow their
  project when it is handed over.
- E2E: a public draft is 404 for visitors and signed-in strangers and missing from the project
  page; publishing it is refused (lock).
- New [`DATABASE.md`](DATABASE.md): implemented data model, deletion rules, personal data,
  retention jobs, export.
- Owner decisions recorded: A (email + 2FA, no waiting period), H (owner moderates), admin roles
  on an admin page, grace-period handling.
- **Verification (run on 2026-11-13):** pytest **428 passed** (5 new); 2 mutation checks
  caught (export of other people's applications, grace-period filter); Playwright **72 passed** (lock test extended);
  Vitest **82 passed**.

## Phase 3B – Security gate (2026-11-13) ✅ implemented – flag still off

All eight gate items are implemented and tested; the checklist for the owner is
[`GATE-CHECKLIST.md`](GATE-CHECKLIST.md). `PUBLIC_CAMPAIGNS_ENABLED` stays `false`: the
operations items of the checklist (part 2) need the production server, and only the owner
switches the flag.

### WP 3B.1 – Platform roles (2026-11-13) ✅

- `User.platform_role` (none, moderator, admin); `apps/accounts/roles.py` (roles count only with
  2FA, active and not deleting); `set_platform_role` command for the first admin; API
  `/api/v1/platform/roles/` (admins only, 404 otherwise; password confirmation; targets need a
  confirmed email and 2FA; last admin protected with a row lock; rate limit; audit) and
  `/api/v1/me/platform-role/`; page `/platform/roles` and a link on the account page for admins
  ([ADR 0018](adr/0018-platform-roles.md)).
- Deviation from the plan: the role comes from a new endpoint `/api/v1/me/platform-role/`
  (there was no `/api/v1/me/` endpoint to extend).
- **Verification (run on 2026-11-13):** pytest **439 passed** (11 new); 4 mutation checks
  caught (no 2FA check, no last-admin guard, no password check, target without 2FA); Vitest
  **82 passed**; Playwright **73 passed** (1 new: first admin via command, 404 for others, 2FA
  required for the candidate, wrong password, granting the moderator role, axe; the TOTP helper
  moved to `e2e/tests/helpers.ts`).
- Note: the E2E database keeps admins of earlier runs, so "last admin" is tested in pytest only.

### WP 3B.2 – Reporting (2026-11-13) ✅

- New app `apps/moderation`: `Report` (target copy, reason, free text, status), reporting service
  that resolves the target through the page selectors (404 for invisible content), confirmed
  email, one open report per content, 20 per day, audit without free text; automatic suspension
  of a download link after 3 different accounts reported malware (served to no one, team
  emailed, team cannot change it); `/api/v1/reports/`, `/api/v1/me/reports/`; reports in the data
  export ([ADR 0019](adr/0019-reporting-and-link-suspension.md)).
- Frontend: "Report" on project and campaign pages (not for the team) and "Report this link" on
  the warning page; `/report` page (reason, details, privacy note); thanks notice; "Your reports"
  on the account page; suspended links marked for the team.
- **Verification (run on 2026-11-13):** pytest **447 passed** (8 new); mutation checks: 3 of
  4 caught (visibility check removed, suspended links served, participant list unfiltered); the
  4th (counting reports instead of distinct reporters) changes nothing because a database
  constraint already allows one open report per account and content – an equivalent mutant,
  noted in ADR 0019; Vitest **85 passed**; Playwright **75 passed** (2 new).

### WP 3B.3, part 1 – Blocking and moderation backend (2026-11-13) ✅

- `blocked_at` on projects, campaigns and links, enforced centrally: project and campaign
  policies (only the team sees blocked content), `CampaignLink.is_served()` (suspended or blocked
  link, blocked campaign or project: served to no one, the team included), team changes refused
  with `blocked` (project, images, campaigns, state changes, links, questions, invitations),
  joining through an invitation refused, blocked content removed from participations and open
  invitations.
- `Block` (category, message, lift, one appeal with decision) and `ModerationNote` (warnings,
  moderators only); actions take, block, lift, warn, dismiss, lift suspension, appeal, decide
  appeal; emails to teams and reporters (no details); audit without reporters' free text.
- API: `/api/v1/moderation/cases/` (malware and suspended links first), case detail, actions,
  block lift, appeals and decisions (moderators only, 404 otherwise); `/api/v1/blocks/<id>/appeal/`
  (team only); `moderation` info in project and campaign data for the team; `blocked` on links.
- **Verification (run on 2026-11-13):** pytest **459 passed** (12 new); 5 mutation checks caught –
  one (link served despite a blocked campaign) only after adding a test for the team's own view;
  Playwright **75 passed**; OpenAPI clean after fixing two schema warnings.

### WP 3B.3, part 2 – Moderation pages (2026-11-13) ✅

- `/moderation` (open cases with malware and suspended markers, appeals) and
  `/moderation/<type>/<id>` (reports with reporter names, earlier warnings and blocks, actions
  take, block with confirmation, warn, dismiss with confirmation, lift suspension, lift block,
  decide appeal); team notice with reason and the single appeal form on project and campaign
  pages (`/blocks/<id>/appeal`); blocked links marked in the team's link list; "Moderation" link
  on the account page for moderators ([ADR 0020](adr/0020-moderation-and-blocking.md)).
- **Verification (run on 2026-11-13):** Playwright **76 passed** (1 new: report, queue, block
  with confirmation, 404 for visitors and the reporter, reporter sees "Resolved", team notice and
  appeal, appeal accepted, project back, axe on the case page; moderation pages 404 for others).

### WP 3B.4 – Review of public campaigns (2026-11-13) ✅

- Stored state `in_review`: a team's "publish" of a public campaign submits it for review (rule A:
  confirmed email and 2FA); moderators approve (published, `published_at` set then) or send it back
  with a reason; only the team sees it in review. Link review: new or changed (URL, checksum) links
  of public campaigns wait and are served to no one until approved; the campaign and its reviewed
  links stay available ([ADR 0021](adr/0021-review-of-public-campaigns.md)).
- Moderation page: "Reviews" with campaigns (all links visible) and single links (URL, checksum),
  approve or send back with reason and confirmation. Edit page: "Submit for review", reason notice,
  link pills "Waiting for review"/"Rejected". New status "In Review" (team only), an addition to the
  six statuses of the master prompt.
- Older tests adapted to the new flow (publishing public campaigns now needs 2FA and review; link
  tests of a public campaign approve their links as moderators would).
- **Verification (run on 2026-11-13):** pytest **467 passed** (8 new); 4 mutation checks caught
  (review ignored when serving, rule A removed, URL change keeps approval, submit publishes
  directly); Vitest **85 passed**; Playwright **76 passed** (axe on the moderation queue with the
  reviews section; the lock test now uses "Submit for review"). The review flow itself is covered
  by pytest only, because public campaigns are locked in E2E.

### WP 3B.5 – Rate limits per account and IP, shared database cache (2026-11-13) ✅

- Django's database cache (`rate_limit_cache`, created by migration) replaces the per-process
  cache, so limits hold across workers. Every cache key is an HMAC-SHA256 hash: no IP address or
  email address is stored in plain text (owner's decision: only as a hash, at most one day).
  `manage.py purge_rate_limit_cache` deletes expired entries and runs **hourly** – Django removes
  them on its own only when the table outgrows `MAX_ENTRIES`
  ([ADR 0022](adr/0022-rate-limits-and-shared-cache.md)).
- Client address: `DJANGO_TRUSTED_PROXY_COUNT` sets allauth's and DRF's trusted proxy count
  together; 0 in development (`X-Forwarded-For` ignored, cannot be forged), required and at least
  1 in production. The SSR server now passes the reverse proxy's `X-Forwarded-For` on; before,
  all SSR visitors shared the SSR server's address.
- Per-IP limits in addition to the per-account limits for reports, campaign creation, project
  creation, project and campaign invitations, avatar, logo and screenshot uploads (values in
  ADR 0022, provisional). Login, signup and reset keep allauth's defaults, now tested.
- `DJANGO_E2E_RELAXED_RATE_LIMITS` (development settings only) also relaxes the per-IP API limits,
  because the counters now outlive an E2E run.
- **Verification (run on 2026-11-13):** pytest **490 passed** (23 new: limits per account and per
  IP, another address unaffected, forged `X-Forwarded-For` ignored, one trusted proxy counted,
  failed logins per IP and per account, signup and reset per IP, no plain IP or key in the cache
  table, every gate view carries both limits, purge of expired entries, production refuses a
  missing or invalid proxy count); 5 mutation checks caught (per-IP limit removed, key hashing
  removed, `NUM_PROXIES` unset, purge deletes nothing, SSR stops forwarding the header);
  Vitest **87 passed**; Playwright **76 passed**; Ruff, migrations check, OpenAPI validation and
  pip-audit clean.

### WP 3B.6 – E2E abuse case and gate checklist (2026-11-13) ✅

- Separate Playwright run with public campaigns on for that run only
  (`e2e/playwright.gate.config.ts`, `pnpm test:gate`); the main run keeps testing the lock. Both
  configurations share one definition (`e2eConfig` in `playwright.config.ts`). CI runs the gate
  run after the main run on every push.
- `e2e/gate/abuse-case.spec.ts`: a team with 2FA submits a public campaign with a link; a
  moderator approves it in the review queue (axe with a non-empty queue); a tester joins, opens
  the warning page and reports the link as malware; the moderator blocks the link. Afterwards the
  warning page and the link API answer 404 to the participant and to the team, the team sees
  "Blocked by moderators", the campaign stays available, the reporter sees "Resolved".
- `setRole` moved to the shared E2E helpers.
- [`GATE-CHECKLIST.md`](GATE-CHECKLIST.md): the eight gate items with their evidence, the
  operations items before switching, known risks, and how to switch.
- **Verification (run on 2026-11-13):** Playwright main run **76 passed**, gate run **1 passed**;
  mutation check caught (a blocked link still served: the warning page answered 200 instead of
  404). No application code changed in this WP.

## Phase 4 – Testing (2026-11-14) ✅

### WP 4.1 – Testing method, tasks and progress: backend (2026-11-14) ✅

- `Campaign.method` (free, structured, combined; frozen after publishing; existing campaigns are
  free), `TestTask` (at most 30 visible per campaign) and `TaskProgress` per participation and task
  with an optional note ([ADR 0023](adr/0023-test-methods-tasks-and-progress.md); owner's decisions
  of 2026-11-13).
- Rules: structured and combined need a task to publish or submit (`tasks_required`); no switch to
  free while tasks exist; a task with reported progress is hidden, not deleted; the last task of a
  published campaign stays; closed and blocked campaigns are read-only; only active participants
  report, throttled at 300 per hour.
- API: tasks (everyone who sees the campaign reads them, with their own status only), move, own
  progress, and the team's overview `…/progress/` (404 for everyone else, moderators included;
  people who left or were removed are marked; hidden tasks with progress stay listed).
- Tasks appear in the moderators' review queue; own progress with notes is in the data export and
  goes with the account.
- **Verification (run on 2026-11-14):** pytest **512 passed** (22 new); 4 mutation checks caught
  (overview open to everyone, minimum task ignored, hiding deletes, others' progress visible);
  Ruff, migrations check, OpenAPI validation (enum names fixed for the new choices) and pip-audit
  clean; Playwright main run **76 passed**, gate run **1 passed** (no frontend change in this WP).

### WP 4.2 – Team pages: testing method and tasks (2026-11-14) ✅

- Campaign form: "Testing method" with free, structured and combined (each with a short
  explanation), offered only for drafts like visibility and participation. The free-text field
  is now labelled "How to test".
- Edit page: "Test tasks" panel – add (title, Markdown instructions, expected result), edit in a
  disclosure, move up and down, remove; after removing, the page says whether the task was
  deleted or hidden because testers had already reported progress. Free campaigns explain that
  they have no tasks. All plain forms, no JavaScript needed.
- Campaign page: the method in the details and a "Test tasks" section with the tasks in order
  (instructions rendered with the safe Markdown allowlist).
- Accessibility finding fixed during the WP: the move buttons' names now start with their
  visible text ("Move up “…”", WCAG 2.5.3 Label in Name, found by axe).
- **Verification (run on 2026-11-14):** Vitest **91 passed** (4 new); Playwright main run **77
  passed** (new: a structured campaign refuses publishing without a task, tasks are added,
  reordered, edited and removed, shown on the campaign page; axe on both pages), gate run **1
  passed**; ESLint, typecheck, build clean; `pnpm audit` only the known moderate `minimatch`
  advisory (development only).

### WP 4.3 – Testers report their progress (2026-11-14) ✅

- Campaign page: active participants see their own status per task (design-system task status
  with icon and text) and a plain form per task – status (not started, in progress, completed,
  blocked) and an optional note; the panel shows "x of y completed · z blocked". After completing
  or cancelling, or after leaving, the statuses and the note stay visible to the person,
  read-only. Nobody else sees them on this page – not other participants, not the team (the team's
  overview follows in WP 4.4).
- Account page: running participations show the own progress in short.
- API: `…/me/participations/` adds `tasks_total`, `tasks_completed`, `tasks_blocked` (own, visible
  tasks only).
- Pages that show own progress are only ever served to signed-in people with `private, no-store`.
- **Verification (run on 2026-11-14):** pytest **513 passed** (1 new); Vitest **93 passed** (2
  new); Playwright main run **78 passed** (new: two invited testers, one reports completed and
  blocked with a note, the other tester and the team do not see it, a stranger gets 404, the
  account page shows the summary, the completed campaign is read-only; axe on the tester's page),
  gate run **1 passed**; Ruff, migrations check, ESLint, typecheck and build clean.

### WP 4.4 – The team's progress overview (2026-11-14) ✅

- Testers page (team only; 404 for everyone else): new "Progress" panel for structured and
  combined campaigns – per task the number of completed, blocked and in-progress statuses; per
  tester the status of every task (design-system task status with icon and text) with notes
  behind a disclosure. People who left or were removed and tasks removed after progress was
  reported are marked.
- A table with row and column headers on wide screens (scrolling inside its own focusable
  container, the page never scrolls sideways); a list per tester below 48rem. Only one of the two
  is displayed at a time.
- **Verification (run on 2026-11-14):** Vitest **94 passed** (1 new); Playwright main run **78
  passed** (the progress test now also checks the team's overview: per-task counts, the table
  with headers, the note, axe at 1280 and 390 px, the list on narrow screens, and 404 for a
  participant and a stranger), gate run **1 passed**; ESLint, typecheck, build clean; backend
  unchanged in this WP.

## Phase 5 – Feedback (started 2026-11-14)

### WP 5.1 – Feedback backend: types, permissions, status, publishing (2026-11-14) ✅

- New app `apps.feedback` ([ADR 0024](adr/0024-feedback.md); owner's decisions of 2026-11-14):
  five kinds with type-specific fields, optional link to a test task, status history, duplicates
  within the campaign.
- Visibility in one policy module: team all; author own (also after leaving, via
  `/api/v1/me/feedback/`); active participants all feedback of their campaign; published
  feedback everyone who sees the campaign; blocked content hidden; everything else 404. Only the
  team and the author see who wrote a feedback.
- Workflow: the team sets the statuses up to Fixed (any order), the author verifies or reopens;
  team changes email the author. Publishing needs the team's proposal and the author's consent;
  either side can withdraw (audited). Authors change or withdraw while "New".
- Team counter `new_feedback` in the campaign response; rate limits 30/day per account and 60/day
  per IP; export contains own feedback; final account deletion anonymises (author NULL).
- **Verification (run on 2026-11-14):** pytest **546 passed** (33 new, including the permission
  matrix for eight roles on private and published feedback); 4 mutation checks caught
  (publishing without consent, author sets any status, private list open, author name visible);
  a real bug found by the tests and fixed: row locking with the nullable author join is refused
  by PostgreSQL – only the feedback row is locked now. Ruff, migrations check, OpenAPI
  validation, pip-audit clean; Playwright main run **78 passed**, gate run **1 passed** (no
  frontend change yet).

## Handover – next session (written 2026-11-14)

**Where we are:** phases 3A and 3B complete – all eight security-gate items are implemented and
tested ([`GATE-CHECKLIST.md`](GATE-CHECKLIST.md)). `PUBLIC_CAMPAIGNS_ENABLED` stays off: the
checklist's operations items need the production server, and only the owner switches the flag.
Phase 4 (testing) is complete (WPs 4.1–4.4, ADR 0023). Phase 5 (feedback) is under way with the
approved plan and the owner's decisions of 2026-11-14 (ADR 0024): WP 5.1 (backend) is done; next
are WP 5.2 (secure attachments), 5.3 (testers' feedback pages), 5.4 (the team's inbox) and 5.5
(published feedback, wrap-up).

Decided for 3B (2026-11-13): A – confirmed email and 2FA, no waiting period, review queue for
every public campaign; H – the owner moderates alone, built role-based; admin and moderator roles
are assigned on an admin page (first admin via a one-off server command; fresh reauthentication
and 2FA for role changes; audited; the last admin cannot remove themselves).

**Decided for 3B on 2026-11-13 as well:** report reasons (malware, deception/phishing, someone
else's software, spam, legal violation, other; free text optional; malware first), feedback to
reporters on the account page plus a short email when closed, shared cache = Django's database
cache (open question O).

**Owner decisions of 2026-11-13** are in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) and ADRs
0015–0017; data model in [`DATABASE.md`](DATABASE.md); metrics in [`METRICS.md`](METRICS.md)
(statistics page = WP M.1 after phase 5). Still open: U (real GitHub test on the first test
server, including the second callback URL `<frontend>/projects/github/verify/callback`).

**Working in the cloud environment:** start Docker inline when `docker info` fails
(`dockerd` in the background, then `docker compose up -d db mailpit`); backend commands need
`UV_SYSTEM_CERTS=1` and `--env-file ../.env`; E2E with
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --trace off`, then
`pnpm test:gate` (security-gate run with public campaigns on).
`pnpm audit` reports one moderate advisory in `minimatch` (via ESLint, development only); CI
fails only on high/critical.

## Known limitations

- GitHub Free for private repositories: no push protection and no branch protection (see
  [`SECURITY.md`](SECURITY.md), section 10).
- Signing out everywhere scans all sessions (no index from users to sessions); fine at the current
  scale, to be revisited when sessions grow (ADR 0013).
- The per-IP limit values are provisional (ADR 0022); every limited request writes to PostgreSQL,
  to be measured before the beta.
- Unauthenticated GitHub API requests share a per-IP rate limit; many file checks for GitHub
  repositories in a short time may answer "code host not reachable" until it resets (ADR 0015).
- The design system covers the pages that exist so far; product pages (projects, campaigns, feedback) adopt it as they are built.
