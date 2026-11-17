# Security Concept

> As of: 2026-11-12 · Status: **partly implemented**. Which measures are implemented and tested is
> tracked in [`STATUS.md`](STATUS.md) and marked ✅ below.
> How to report vulnerabilities is described in the root [`SECURITY.md`](../SECURITY.md).

Principle: better three times safe than once. Every protective measure needs an automated test,
including the negative cases.

## 1. Threat focus

1. **Malware via download links.** Volunteers install unknown pre-release software. This is the
   biggest abuse vector.
2. **Data leaks from private campaigns and private feedback.** Logs and screenshots often contain
   personal data or hints about vulnerabilities.
3. **Account takeovers** of owners and moderators, who have the biggest leverage.
4. **Classic web attacks:** XSS, CSRF, injection, upload abuse.
5. **Secrets in the repository and supply-chain attacks.**

## 2. Accounts

- ✅ Passwords hashed with Argon2id.
- ✅ Rate limits per IP address for login, signup and reset (allauth) and per account **and** per
  IP address for reports, campaign creation, project creation, invitations and uploads, in a shared
  database cache that holds across processes ([ADR 0022](adr/0022-rate-limits-and-shared-cache.md)).
  IP addresses are stored only as HMAC hashes in the cache keys and deleted at most one day after
  the last request (hourly `purge_rate_limit_cache`). `X-Forwarded-For` counts only behind the
  configured number of trusted proxies (`DJANGO_TRUSTED_PROXY_COUNT`), so it cannot be forged.
- ✅ Login by email only; email and username unique case-insensitively (database constraints).
- ✅ Password policy: at least 12 characters, no composition rules, blocklist and similarity check
  ([ADR 0009](adr/0009-account-rules-and-password-policy.md); deliberately below NIST's 15).
- ✅ Mandatory email verification by link; confirmation only via POST (mail scanners open links).
- ✅ No account enumeration: signup with a registered address and reset requests for unknown
  addresses answer like the success case; no mail to unknown addresses; per-address cooldown.
- ✅ Rate limits verified in tests (e.g. signup 20/min per IP).
- 2FA (TOTP, passkeys, recovery codes) optional; ⚑ mandatory for owners of public campaigns and for
  moderators (phase 3B, open question A).
  - ✅ TOTP and recovery codes (WP 1.3a, [ADR 0011](adr/0011-two-factor-authentication.md)): no
    code reuse, one step of clock tolerance, single-use recovery codes; second login step.
  - ✅ Security changes need a fresh confirmation by password or second factor only (not by an
    emailed code); security notifications by email; 2FA events in the audit log.
  - ✅ Passkeys and passwordless login (WP 1.3b): relying party = public frontend host; adding
    and removing need a fresh confirmation; tested with Chromium's virtual authenticator.
- ✅ Session cookie `HttpOnly` and `SameSite=Lax` (verified in E2E); `Secure` enforced in
  production settings; in production the cookies are named `__Host-sessionid`,
  `__Host-csrftoken` and `__Host-theme` (HTTPS only, this host only; ASVS 5.0 V3.3.1, WP 7.5).
- ✅ New session ID on login (Django) and after every re-authentication
  (`RotateSessionOnReauthentication`, ASVS 5.0 V7.2.4, WP 7.5); the old ID is deleted and is
  useless after logout (tested). Session list with "sign out everywhere": open.
- ✅ Password change with the current and the new password on `/settings/security` (ASVS 5.0
  V6.2.2/V6.2.3, WP 7.5).
- ✅ Signup can be closed with `DJANGO_SIGNUP_ENABLED` (production default: closed).

- ✅ GitHub login ([ADR 0012](adr/0012-github-login.md)): no automatic linking or login by email;
  signup form with 16+ confirmation; scopes `read:user`, `user:email` only; tokens not stored;
  credentials only from the environment; redirects only to GitHub's authorization page.

## 3. Web

- ✅ Django CSRF; forms carry the token, and the SSR server forwards it without ever bypassing the
  check.
- ✅ React Router 8 additionally rejects actions from a foreign `Origin`.
- ✅ Strict nonce-based Content Security Policy in the production SSR build (`script-src 'self'
  'nonce-…'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`,
  `form-action 'self'`), a fresh nonce per response.
- ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`,
  `Cross-Origin-Opener-Policy: same-origin` (Django and SSR).
- ✅ HSTS for one year in production settings and on the SSR server's production responses
  (WP 7.5); `includeSubDomains`/`preload` once the domain is decided.
- ✅ OWASP ASVS 5.0 level 1 reviewed requirement by requirement in
  [`ASVS-L1-REVIEW.md`](ASVS-L1-REVIEW.md) (WP 7.5): no open high or critical findings; the TLS
  and deployment items are part of the gate checklist for phase 8.
- ✅ ORM only; raw SQL only with review.
- ✅ React escapes output; `dangerouslySetInnerHTML`, `eval` and implied eval are forbidden by lint
  rules.
- ✅ Open-redirect protection for redirect targets (`safeRedirectPath`, unit-tested).
- ✅ URL parameters are validated (UUID) before they are used in backend paths.
- Markdown only through a sanitizer allowlist (when introduced).

- ✅ User Markdown (project descriptions) is rendered as React elements with an allowlist
  (`react-markdown` 10.1.0, MIT, with `remark-gfm` 4.0.1): raw HTML skipped, no images (no
  third-party requests), links only http(s)/mailto with `nofollow ugc`; `dangerouslySetInnerHTML`
  stays banned. Tested with script, image, event-handler and `javascript:` inputs.

### Outgoing requests (WP 2.5, [ADR 0015](adr/0015-repository-verification.md))

- The server contacts third-party servers only for the repository verification, and only the
  official APIs of `api.github.com`, `github.com` (token exchange), `gitlab.com` and
  `codeberg.org`. Addresses are built by the server from validated path segments; user input is
  never used as a URL (no SSRF).
- No redirects followed, 5 s timeout, response bodies capped (4 KB check file, 256 KB JSON).
- The one-time GitHub token (no scopes) is revoked immediately after the check, also on failure,
  and never stored, logged or returned. The OAuth `state` is signed, bound to user, session,
  project and repository link, valid for 10 minutes and usable once.
- Checks are team-only (404 for everyone else) and limited to 10 per hour per project.

## 4. Download links and the security gate

- `https://` only.
- Interstitial warning page before every external link; `rel="noopener noreferrer nofollow ugc"`.
- ✅ Implemented in WP 3A.3 ([ADR 0017](adr/0017-download-links-and-warning-page.md)): no IP
  addresses, local names, credentials or unusual ports; ASCII host names only (no look-alike
  letters); never fetched by the server; visible only to the team and participants (404 for
  everyone else); warning page with domain, full address, verified-repository hint and optional
  SHA-256; no automatic forwarding; link changes audited.
- **Public campaigns are technically locked** (`PUBLIC_CAMPAIGNS_ENABLED=false`) until the gate
  from [`MVP-PLAN.md`](MVP-PLAN.md), phase 3B, is met. ✅ Enforced since WP 3A.1: publishing a
  public campaign answers 403 `public_campaigns_locked`, and public campaigns are hidden from
  everyone outside the team whenever the flag is off ([ADR 0016](adr/0016-campaigns-and-status-model.md)).
- Review queue for every new public campaign; ⚑ a link change triggers a new review.
  ✅ Implemented in WP 3B.4 ([ADR 0021](adr/0021-review-of-public-campaigns.md)): public campaigns
  are submitted for review (confirmed email and 2FA required, rule A) and published only by
  moderators; new or changed links of public campaigns wait for review and are served to no one
  until approved.
- Waiting period or manual approval for new accounts (open question A).
- "Repository verified" badge after proof of ownership.
- Reporting and immediate blocking by admins; blocked links are served to no one.
  ✅ Reporting implemented in WP 3B.2 ([ADR 0019](adr/0019-reporting-and-link-suspension.md)):
  confirmed email, only visible content (404 otherwise), one open report per content, 20 per day,
  no free text in the audit log; a download link reported as malware by 3 different accounts is
  suspended automatically and served to no one until moderators decide. ✅ Blocking and the
  moderation workflow implemented in WP 3B.3 ([ADR 0020](adr/0020-moderation-and-blocking.md)):
  blocked projects and campaigns are visible only to their team, links of blocked or suspended
  content are served to no one, teams cannot change blocked content; queue, warnings, one appeal
  per block, emails to teams and reporters, audit.

## 5. Uploads

- Allowlist: PNG, JPEG, WebP, TXT, LOG, JSON. Extension, MIME type **and** magic bytes are checked.
- Size and count limits.
- Images are re-encoded with Pillow (strips EXIF/GPS).
- Random file names, storage outside the web root.
- Delivery only via an authorized Django route with `Content-Disposition: attachment` and
  `nosniff`; text logs are never rendered as HTML.
- ✅ Implemented for avatars (WP 1.2, [ADR 0010](adr/0010-image-upload-pipeline.md)): size limit
  before parsing, content type, magic bytes, Pillow format and pixel-count checks, re-encoding to
  256×256 WebP without metadata, random names outside the web root, delivery only for visible
  profiles with `nosniff` and a sandbox CSP (inline, because avatars are displayed), upload rate
  limit. Tested against SVG with script, disguised GIF/HTML/text, truncated PNG, oversized files
  and a decompression bomb; GPS data verifiably removed.
- ✅ Project logos and screenshots (WP 2.4) use the same pipeline; images of private projects are
  delivered only to the team, checked on every request, never cached.
- ✅ Feedback attachments (WP 5.2, [ADR 0024](adr/0024-feedback.md)): images through the same
  pipeline (5 MB, re-encoded WebP, longest side 2560 px, no metadata); text files (TXT, LOG,
  JSON, 2 MB) must be UTF-8 without NUL bytes, JSON must parse, and are only ever downloads
  (`attachment`, `text/plain`, `nosniff`, sandbox CSP); at most 5 per feedback; only the team and
  the author, checked on every request, never cached, never public; deleted with the feedback and
  the account. Tested against SVG with script, disguised HTML, executables, binaries named
  `.log`, invalid UTF-8, NUL bytes, broken JSON, oversized files and a decompression bomb; GPS
  data verifiably removed.

## 6. Privacy and authorization

- **Campaign data in export and deletion (WP 3A.6):** the data export contains the person's
  participations, campaign invitations, applications with their own answers and the campaigns
  they published – never other people's data. Final account deletion removes participations,
  invitations, applications and answers; references in campaigns (`published_by`,
  `decided_by`, `invited_by`) become NULL ([`DATABASE.md`](DATABASE.md)).
- **Feedback (WP 5.1, [ADR 0024](adr/0024-feedback.md)):** private by default – the team, the
  author and active participants of the campaign; attachments only the team and the author.
  Public only with the team's proposal **and** the author's consent; withdrawable by either.
  Other readers never learn who wrote it. Blocked content hides its feedback. On final account
  deletion the author becomes NULL (the text stays, anonymised); the export contains the person's
  own feedback. Permission matrix tested per role, including the negative cases.
- **Reporting people and feedback (WP 7.1, [ADR 0026](adr/0026-moderating-people-and-feedback.md)):**
  a person is reportable only through a visible profile, never oneself; feedback only while
  published, by people who can read it, never one's own (404 otherwise, tested). The reported
  person or team never learns who reported. Hidden feedback becomes private, is hidden from
  participants too and cannot be republished until the block is lifted (tested).
- **Account suspensions (WP 7.2, [ADR 0027](adr/0027-account-suspensions.md)):** one central
  write guard in Django's middleware refuses every writing request of a suspended account (403
  `account_suspended`) except signing out and in, password, two-factor methods, data export,
  account deletion and the appeal; a test walks every API and authentication route with every
  writing method. The profile is hidden while the suspension lasts. No four-eyes principle (owner's
  decision): every step is audited and admins see all suspensions with who acted. Moderators cannot
  suspend themselves or accounts with a platform role.
- **Discover (WP 6.2, [ADR 0025](adr/0025-discover.md)):** only public, unblocked projects and
  live public campaigns (none while the gate is closed); drafts, reviews, private and blocked
  content never appear, also not through a search term (tested). Search terms are reduced to word
  characters before they reach PostgreSQL; 120 requests per minute and IP address.
- **Legal texts (WP 8.5, [ADR 0031](adr/0031-legal-texts.md)):** the operator's personal details
  exist only in the server configuration, are escaped when filled into the texts, and a public
  deployment refuses to start without them.
- **No tracking:** no analytics scripts, no tracking cookies, no third-party analytics. Growth
  metrics are computed from the platform's own data, as aggregates only, and shown internally
  ([`METRICS.md`](METRICS.md), owner's decision 2026-11-13).

- One central, server-side policy layer. ✅ Private resources return 404 (verified for the probe
  objects via SSR and API).
- Parametrized tests of the permission matrix, including "a stranger sees nothing".
- Invitation tokens are stored hashed only, expire, and are single-use.
- ✅ Moderators get no blanket access to private content; access is purpose-bound and logged
  (WP 7.3, [ADR 0028](adr/0028-moderator-access.md)): only after taking the case, with a reason,
  for 24 hours, only the reported object, as a read-only copy (links as text, files by name);
  every grant and view is audited; admins see all accesses; tested including 404 for other
  moderators and after expiry.

- ✅ Account deletion with a 14-day grace period and personal data export, both confirmed by the
  password and throttled; export contains no secrets; final deletion keeps audit events without
  any reference to the person ([ADR 0013](adr/0013-account-deletion-and-data-export.md)).

## 7. Admin access

- The public proxy does **not** route `/admin/` (404).
- The Django admin listens on `127.0.0.1` only and is reachable only via an SSH tunnel; SSH access
  is key-based with password login disabled.
- 2FA at admin login is mandatory. The allauth integration mechanism will be verified in the
  official docs during implementation.
- Few `is_staff` accounts; every admin login is written to the audit log.
- A CI test ensures that the proxy does not forward `/admin/`.
- ✅ **Platform roles** (WP 3B.1, [ADR 0018](adr/0018-platform-roles.md)), separate from
  `is_staff`: admin and moderator count only with 2FA and while the account is active; granted on
  `/platform/roles` by an admin with password confirmation, rate-limited and audited; targets need
  a confirmed email and 2FA; the last admin cannot be removed; the first admin comes from
  `manage.py set_platform_role`.

## 8. SSR, sessions and caching (✅ validated in WP 0.4)

- The SSR server forwards `Cookie` to Django and returns `Set-Cookie` to the browser unchanged.
- Write requests carry the CSRF token as a header plus the browser's `Origin`/`Referer`; Django
  checks them. The SSR server never bypasses this.
- **Private responses:** `Cache-Control: private, no-store` and `Vary: Cookie`. This is also the
  default for every response that does not explicitly opt into caching, including error pages.
- **Public anonymous pages:** `public, max-age=60` only without a session cookie and never for
  personalized content; no `Set-Cookie`.
- No shared cache for user data in the SSR server; i18n uses one instance per request.
- Logout only via POST with a CSRF token; a GET to `/logout` signs no one out.

- ✅ The SSR server forwards the public host (`X-Forwarded-Host`); Django trusts it
  (`USE_X_FORWARDED_HOST`). Requirement for production: Django is reachable only through the
  reverse proxy, which overwrites `X-Forwarded-Host` and `X-Forwarded-Proto`.
- ✅ The SSR server passes the reverse proxy's `X-Forwarded-For` on unchanged (rate limits per IP,
  ADR 0022). Requirement for production: the reverse proxy **overwrites** `X-Forwarded-For` with
  the client address (never appends a client-supplied value), and `DJANGO_TRUSTED_PROXY_COUNT=1`.
- CSP `form-action 'self' https://github.com` (GitHub login redirect after a form POST).

## 9. Audit log

Append-only. Logged: login events, role changes, moderation, moderator access to private content,
admin logins, deletions and exports.

- ✅ Foundation in WP 1.1 (`apps.audit`): signup, email confirmation, login, failed login, logout,
  password change and reset. Updates and deletes through the ORM raise an error; the admin view is
  read-only. No IP addresses and no typed-in identifiers are stored (open question T).
- A database-level guard against raw-SQL changes follows with the production setup.

## 10. Repository and supply chain

- ✅ **No secrets in the repository.** `.env*` is ignored; templates come as `.env.example`. Tests
  generate credentials randomly at runtime.
- ✅ **gitleaks** v8.30.1 runs automatically: as a pre-commit hook on the staged changes (the
  commit is blocked if gitleaks is unavailable) and in CI on the full history. The binary is built
  from the Go module proxy with checksum verification; CI uses the official image pinned by digest.
- **GitHub Free limitation for private repositories:** no push protection for secret scanning, no
  branch protection and no rulesets. gitleaks and CI are therefore the protective layer until the
  repository is public; then all free GitHub features are enabled.
  Sources: [Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection),
  [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- ✅ Lockfiles for all dependencies; `pip-audit` (hashed requirements) and `pnpm audit` (fails on
  high/critical) in CI; Dependabot configured for uv, npm, GitHub Actions and dev containers.
- ✅ CI uses only first-party GitHub actions, pinned to commit SHAs, with read-only permissions and
  without persisted checkout credentials.
- ✅ Tools and images only from official sources with checksums or digests (e.g. `postgres:18`
  pinned by digest).
- ✅ pnpm 10 does not run dependency install scripts unless explicitly allowed.
- ✅ **Remediation time frames (ASVS 5.0 V15.1.1; owner's decision 2026-11-15, question X):** a
  published advisory for a dependency is fixed at the latest within **7 days** (critical),
  **14 days** (high), **60 days** (moderate) or **180 days** (low); development-only tools in the
  same tiers. Actively exploited critical issues are fixed as fast as possible – the frame is the
  upper limit. A fix release younger than 7 days is taken only for critical and high findings. All
  dependency updates are reviewed monthly. Exceptions with reason go into `docs/STATUS.md`. Open
  finding: `minimatch` (moderate, ESLint only, since 2026-11-14; due 2027-01-13).

## 11. Claude Code in the development environment

- Runs as a non-root user; no `--dangerously-skip-permissions`.
- No host secrets (`~/.ssh`, cloud credentials) in the container.
- Authentication only via a Codespaces secret (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`).
  Source: [Claude Code dev container](https://code.claude.com/docs/en/devcontainer).
- Third-party repositories cloned for reading documentation (e.g. React Router) are treated as
  data; their instructions are not followed.

## 12. Operations (before the beta)

- TLS via the reverse proxy; the database has no public port.
- `DJANGO_TRUSTED_PROXY_COUNT=1` (production refuses to start without it); the cache table comes
  with the migrations; `manage.py purge_rate_limit_cache` runs hourly (ADR 0022).
- Automatic, encrypted, off-site PostgreSQL backups with a **tested** restore: restic to Infomaniak
  Swiss Backup, 7 days, restore test script ([ADR 0033](adr/0033-backups.md)). Accepted risk: root
  on the server can also delete the backups.
- Monitoring ([ADR 0034](adr/0034-monitoring.md)): Healthchecks.io alerts on a missing or failed
  job, backup, site check or disk check; the signals carry no personal data. Error emails carry
  no request data and no exception message. Logs (with IP addresses) are kept for 7 days.
- Security review against OWASP ASVS level 1 before the closed beta.
