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
- allauth rate limits for login, signup and reset. They rely on Django's cache; a shared cache is
  required in production (open question O).
- ✅ Login by email only; email and username unique case-insensitively (database constraints).
- ✅ Password policy: at least 12 characters, no composition rules, blocklist and similarity check
  ([ADR 0009](adr/0009-account-rules-and-password-policy.md); deliberately below NIST's 15).
- ✅ Mandatory email verification by link; confirmation only via POST (mail scanners open links).
- ✅ No account enumeration: signup with a registered address and reset requests for unknown
  addresses answer like the success case; no mail to unknown addresses; per-address cooldown.
- ✅ Rate limits verified in tests (e.g. signup 20/min per IP).
- 2FA (TOTP, passkeys, recovery codes) optional; ⚑ mandatory for owners of public campaigns and for
  moderators (phase 1).
- ✅ Session cookie `HttpOnly` and `SameSite=Lax` (verified in E2E); `Secure` enforced in
  production settings.
- New session on login; session list with "sign out everywhere" (phase 1).
- ✅ Signup can be closed with `DJANGO_SIGNUP_ENABLED` (production default: closed).

## 3. Web

- ✅ Django CSRF; forms carry the token, and the SSR server forwards it without ever bypassing the
  check.
- ✅ React Router 8 additionally rejects actions from a foreign `Origin`.
- ✅ Strict nonce-based Content Security Policy in the production SSR build (`script-src 'self'
  'nonce-…'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`,
  `form-action 'self'`), a fresh nonce per response.
- ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`,
  `Cross-Origin-Opener-Policy: same-origin` (Django and SSR).
- ✅ HSTS for one year in production settings; `includeSubDomains`/`preload` once the domain is
  decided.
- ✅ ORM only; raw SQL only with review.
- ✅ React escapes output; `dangerouslySetInnerHTML`, `eval` and implied eval are forbidden by lint
  rules.
- ✅ Open-redirect protection for redirect targets (`safeRedirectPath`, unit-tested).
- ✅ URL parameters are validated (UUID) before they are used in backend paths.
- Markdown only through a sanitizer allowlist (when introduced).

## 4. Download links and the security gate

- `https://` only.
- Interstitial warning page before every external link; `rel="noopener noreferrer nofollow ugc"`.
- **Public campaigns are technically locked** (`PUBLIC_CAMPAIGNS_ENABLED=false`) until the gate
  from [`MVP-PLAN.md`](MVP-PLAN.md), phase 3B, is met.
- Review queue for every new public campaign; ⚑ a link change triggers a new review.
- Waiting period or manual approval for new accounts (open question A).
- "Repository verified" badge after proof of ownership.
- Reporting and immediate blocking by admins; blocked links are served to no one.

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

## 6. Privacy and authorization

- One central, server-side policy layer. ✅ Private resources return 404 (verified for the probe
  objects via SSR and API).
- Parametrized tests of the permission matrix, including "a stranger sees nothing".
- Invitation tokens are stored hashed only, expire, and are single-use.
- Moderators get no blanket access to private content; access is purpose-bound and logged.

## 7. Admin access

- The public proxy does **not** route `/admin/` (404).
- The Django admin listens on `127.0.0.1` only and is reachable only via an SSH tunnel; SSH access
  is key-based with password login disabled.
- 2FA at admin login is mandatory. The allauth integration mechanism will be verified in the
  official docs during implementation.
- Few `is_staff` accounts; every admin login is written to the audit log.
- A CI test ensures that the proxy does not forward `/admin/`.

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

## 11. Claude Code in the development environment

- Runs as a non-root user; no `--dangerously-skip-permissions`.
- No host secrets (`~/.ssh`, cloud credentials) in the container.
- Authentication only via a Codespaces secret (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`).
  Source: [Claude Code dev container](https://code.claude.com/docs/en/devcontainer).
- Third-party repositories cloned for reading documentation (e.g. React Router) are treated as
  data; their instructions are not followed.

## 12. Operations (before the beta)

- TLS via the reverse proxy; the database has no public port.
- Automatic, encrypted, off-site PostgreSQL backups with a **tested** restore.
- Security review against OWASP ASVS level 1 before the closed beta.
