# OWASP ASVS 5.0 Level 1 – Review

> WP 7.5, 2026-11-14. Every level 1 requirement of ASVS **5.0.0** with its status, evidence and
> action. Source: the official repository
> [OWASP/ASVS](https://github.com/OWASP/ASVS), file
> `5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv` at commit
> `62981c68fd06206e8afa161653943935de9a5047` (2026-11-04): 345 requirements, **70 at level 1**.
> The requirement texts are shortened here; the CSV is authoritative.
>
> Scope: the application in this repository (Django API, React Router SSR frontend). Operations
> (TLS termination, server, deployment) do not exist yet; those requirements are marked
> **phase 8** and are listed in [`GATE-CHECKLIST.md`](GATE-CHECKLIST.md).

**Status:** ✅ met · 🔧 fixed in WP 7.5 · ➖ not applicable · 🕓 phase 8 (operations) ·
❓ owner's decision pending (none since 2026-11-15)

## Summary

| Status | Count |
|---|---|
| ✅ met | 48 |
| 🔧 fixed in WP 7.5 | 6 |
| ➖ not applicable | 12 |
| 🕓 phase 8 (operations) | 4 |
| **Total** | **70** |

Fixes in WP 7.5: `__Host-` cookie names in production (V3.3.1), HSTS also on the frontend's
responses (V3.4.1), the malicious-lockout documentation (V6.1.1, ADR 0022), password change in
the settings (V6.2.2, V6.2.3), a new session ID after re-authentication (V7.2.4). The remediation
time frames (V15.1.1) were decided by the owner on 2026-11-15 (question X). No open high or
critical findings.

## V1 Encoding and Sanitization

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V1.2.1 | Context-aware output encoding (HTML, attributes, headers) | ✅ | React escapes all output; no `dangerouslySetInnerHTML` (ESLint rule); Markdown via an allowlist renderer without raw HTML ([`SECURITY.md`](SECURITY.md) §3); header values built by the framework |
| V1.2.2 | URLs from untrusted data encoded; only safe protocols | ✅ | `URLSearchParams`/`encodeURIComponent` for query parts; profile links and download links `https` only (tests in `profiles`, `campaigns`); Markdown links through `safeMarkdownUrl`; redirects through `safeRedirectPath` (`lib/http.test.ts`) |
| V1.2.3 | Encoding when building JavaScript/JSON | ✅ | JSON only via `JSON.stringify`/DRF; SSR data serialised by React Router; no script building from user input |
| V1.2.4 | Parameterised queries / ORM | ✅ | Django ORM everywhere; full-text search via `SearchQuery` with reduced words (ADR 0025); the two raw statements use a parameter and a quoted table name from settings (`purge_rate_limit_cache`, health check `SELECT 1`) |
| V1.2.5 | No OS command injection | ✅ | The backend starts no processes; no `subprocess`/`os.system` in application code |
| V1.3.1 | WYSIWYG/HTML input sanitised | ✅ | No HTML input: descriptions are Markdown rendered with an allowlist, raw HTML is not rendered ([`SECURITY.md`](SECURITY.md) §3) |
| V1.3.2 | No `eval()` or dynamic code execution | ✅ | None in backend or frontend (grep); CSP without `unsafe-eval` |
| V1.5.1 | XML parsers restrictive (no XXE) | ➖ | No XML is parsed; uploads accept PNG, JPEG, WebP and text only (no SVG) |

## V2 Validation and Business Logic

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V2.1.1 | Documented input validation rules | ✅ | The OpenAPI schema generated from the serializers states types, lengths, enums and formats (validated in CI); rules with security impact in ADRs 0009 (passwords), 0017 (links), 0024 (attachments), 0025 (search) |
| V2.2.1 | Input validated against expectations (allowlists, ranges) | ✅ | DRF serializers with choices, lengths and ranges; catalog values by allowlist; tested per app |
| V2.2.2 | Validation at a trusted service layer | ✅ | All checks in Django; the frontend's `required`/`maxLength` are convenience only |
| V2.3.1 | Business flows in order, no skipped steps | ✅ | State machines in services: campaign states (ADR 0016), review before publishing (ADR 0021), feedback publishing needs proposal then consent (ADR 0024), email confirmation before login |

## V3 Web Frontend Security

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V3.2.1 | No rendering in the wrong context (uploads, API) | ✅ | Uploads served with `Content-Disposition`, `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`; text files only as attachment (ADR 0024); API answers JSON |
| V3.2.2 | Text rendered with safe functions | ✅ | React text nodes; moderators' read-only copy shows texts as plain text (WP 7.3) |
| V3.3.1 | Cookies `Secure` and `__Host-`/`__Secure-` prefix | 🔧 | Production: `__Host-sessionid`, `__Host-csrftoken`, theme cookie `__Host-theme` over HTTPS; `test_prod_settings.py`, `http.test.ts`, `theme.test.ts`. Development over plain HTTP keeps the unprefixed names |
| V3.4.1 | HSTS on all responses, at least one year | 🔧 | Django production settings (1 year) and now also the frontend's production responses (`entry.server.tsx`); `includeSubDomains` with the domain (question N); verify on the server in phase 8 |
| V3.4.2 | CORS `Access-Control-Allow-Origin` fixed or allowlisted | ✅ | No CORS: no `Access-Control-*` headers anywhere; the browser talks to one origin, the SSR server calls Django server-side |
| V3.5.1 | Anti-forgery for requests without CORS preflight | ✅ | Django CSRF tokens for every unsafe request (API, allauth headless); React Router checks the `Origin` of actions; `SameSite=Lax` cookies |
| V3.5.2 | Preflight-based protection cannot be bypassed | ➖ | The application does not rely on CORS preflight (V3.5.1 applies) |
| V3.5.3 | Sensitive functions only via unsafe methods | ✅ | Every change is POST/PUT/PATCH/DELETE (DRF views, React Router actions); GET loaders only read |

## V4 API and Web Service

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V4.1.1 | `Content-Type` matching the body, with charset | ✅ | HTML `text/html; charset=utf-8` (`entry.server.tsx`); API `application/json` (UTF-8 by definition, RFC 8259 §8.1; the media type has no charset parameter); images `image/webp`, text files `text/plain; charset=utf-8` |
| V4.4.1 | WebSockets over TLS | ➖ | No WebSockets |

## V5 File Handling

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V5.2.1 | File size limits | ✅ | Avatars, project images and attachments with size limits checked before reading (ADRs 0010, 0024; tests); frontend refuses oversized requests before parsing |
| V5.2.2 | Extension and content checked | ✅ | Images decoded and re-encoded as WebP (Pillow); text files checked for UTF-8 text; disguised files rejected (tests and E2E) |
| V5.3.1 | Uploads not executed as code | ✅ | Files outside the web root under random keys, served only through views with `sandbox` CSP |
| V5.3.2 | File paths not from user input | ✅ | Storage keys are server-generated UUIDs; the original name is only metadata, sanitised for `Content-Disposition` |

## V6 Authentication

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V6.1.1 | Documented rate limiting, incl. malicious lockout | 🔧 | ADR 0022 (limits per user and IP, shared cache) now also explains why the per-account limit cannot lock an owner out |
| V6.2.1 | Passwords at least 8 characters | ✅ | Minimum 12 (ADR 0009), below the recommended 15 by the owner's decision |
| V6.2.2 | Users can change their password | 🔧 | New form on `/settings/security` (WP 7.5); E2E `mfa.spec.ts` |
| V6.2.3 | Change needs current and new password | 🔧 | allauth's password change requires `current_password`; E2E checks a wrong current password is refused |
| V6.2.4 | Checked against at least the top 3000 passwords | ✅ | Django `CommonPasswordValidator` (about 20,000 passwords); E2E refuses `password1234` |
| V6.2.5 | No composition rules | ✅ | ADR 0009 |
| V6.2.6 | Password fields `type=password` | ✅ | All password fields (login, signup, reauthentication, export, deletion, roles, team transfer, password change) |
| V6.2.7 | Paste and password managers allowed | ✅ | No paste blocking, `autocomplete` `current-password`/`new-password` |
| V6.2.8 | Password verified exactly as entered | ✅ | No trimming or case changes (Django/allauth); maximum length 256 refuses instead of truncating |
| V6.3.1 | Brute-force and stuffing controls as documented | ✅ | allauth login limits per IP and per account, effective across processes (ADR 0022, tests) |
| V6.3.2 | No default accounts | ✅ | No accounts are created by migrations; the first admin is assigned by a server command to an existing account (ADR 0018) |
| V6.4.1 | Initial passwords/activation codes random, expiring, single-use | ✅ | No system-generated passwords; email confirmation keys from allauth (HMAC, 3 days); reset keys single-use (E2E `accounts.spec.ts`) |
| V6.4.2 | No password hints or secret questions | ✅ | None |

## V7 Session Management

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V7.2.1 | Session verification in a trusted backend | ✅ | Django database sessions; the SSR server asks Django for every request with a session cookie |
| V7.2.2 | Dynamically generated session tokens | ✅ | Django session keys; no static API keys |
| V7.2.3 | Reference tokens from a CSPRNG, at least 128 bits | ✅ | Django session keys: 32 characters from `[a-z0-9]` via `secrets` (about 165 bits) |
| V7.2.4 | New session token on authentication and re-authentication | 🔧 | Login: Django `login()` rotates the key. Re-authentication: new middleware `RotateSessionOnReauthentication` (WP 7.5); test `test_reauthentication_issues_a_new_session_id`, mutation check caught |
| V7.4.1 | Logout invalidates the session in the backend | ✅ | allauth logout flushes the session; E2E `ssr-auth.spec.ts` sends the old session ID to Django after logout and gets 401 (added in WP 7.5) |
| V7.4.2 | All sessions ended when an account is disabled or deleted | ✅ | `end_all_sessions` on deletion request (ADR 0013); inactive accounts are rejected by Django's backend on every request |

## V8 Authorization

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V8.1.1 | Documented authorization rules | ✅ | [`ARCHITECTURE.md`](ARCHITECTURE.md) roles, ADRs 0010, 0016, 0018, 0020, 0024, 0027, 0028; policy modules per app |
| V8.2.1 | Function-level access only with explicit permission | ✅ | Default `IsAuthenticated`, public endpoints opt out; moderator and admin views check roles (404 otherwise) |
| V8.2.2 | Data-level access (IDOR/BOLA) | ✅ | Every object loaded through policies; private resources answer 404; parametrised negative tests ("a stranger sees nothing") in every app |
| V8.3.1 | Authorization in a trusted layer | ✅ | Django policies only; the frontend hides buttons but Django decides; suspended accounts blocked centrally (ADR 0027, route walk test) |

## V9 Self-contained Tokens

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V9.1.1 | Tokens validated by signature/MAC | ➖ | No self-contained tokens (no JWT); sessions are reference tokens |
| V9.1.2 | Algorithm allowlist, no `none` | ➖ | as above |
| V9.1.3 | Key material from trusted sources | ➖ | as above |
| V9.2.1 | Validity time span checked | ➖ | as above |

## V10 OAuth and OIDC

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V10.4.1 | Authorization server: exact redirect URI allowlist | ➖ | The application is no authorization server; it is an OAuth client of GitHub (callback URLs registered at GitHub, question U) |
| V10.4.2 | Authorization codes single-use | ➖ | as above (GitHub's responsibility) |
| V10.4.3 | Authorization codes short-lived | ➖ | as above |
| V10.4.4 | Only needed grants, no implicit/password grant | ➖ | as above; the client uses the authorization code flow with `state` (allauth) |
| V10.4.5 | Refresh token replay protection | ➖ | as above; no refresh tokens are kept |

## V11 Cryptography

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V11.3.1 | No insecure block modes or paddings | ✅ | The application encrypts nothing itself; TLS settings follow in phase 8 |
| V11.3.2 | Only approved ciphers and modes | ✅ | as above |
| V11.4.1 | Approved hash functions, no MD5 | ✅ | Argon2 for passwords, HMAC-SHA256 for cache keys (ADR 0022) and file checksums SHA-256 (ADR 0017); Django signing with SHA-256; no MD5/SHA-1 in application code |

## V12 Secure Communication

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V12.1.1 | Only TLS 1.2/1.3, latest preferred | 🕓 | Reverse proxy configuration in phase 8 ([`GATE-CHECKLIST.md`](GATE-CHECKLIST.md)) |
| V12.2.1 | TLS for all external HTTP services, no fallback | 🕓 | Django redirects to HTTPS in production; HSTS set; outgoing calls are HTTPS only (ADR 0015); proxy in phase 8 |
| V12.2.2 | Publicly trusted certificates | 🕓 | Phase 8 (domain and certificate) |

## V13 Configuration

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V13.4.1 | No source control metadata deployed | 🕓 | Deployment in phase 8: images built from the source without `.git`; to verify on the server |

## V14 Data Protection

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V14.2.1 | Sensitive data not in URLs | ✅ | Session and CSRF tokens only in cookies and headers; passwords in bodies. The one-time keys of email confirmation and password reset are in the emailed link by design: single-use, expiring, and the pages load no third-party resources and send `Referrer-Policy: same-origin` |
| V14.3.1 | Authenticated data cleared from the client after logout | ✅ | Server-rendered pages with `Cache-Control: private, no-store`; no `localStorage`/`sessionStorage` use; logout ends the session in Django |

## V15 Secure Coding and Architecture

| ID | Requirement | Status | Evidence / action |
|---|---|---|---|
| V15.1.1 | Documented remediation time frames for vulnerable components | ✅ | [`SECURITY.md`](SECURITY.md) §10, owner's decision 2026-11-15 (question X): critical 7 days, high 14, moderate 60, low 180 at the latest |
| V15.2.1 | Components within the documented time frames | ✅ | `pip-audit` clean; `pnpm audit`: one moderate advisory in ESLint's `minimatch` (development only) since 2026-11-14, due 2027-01-13; CI fails on high and critical |
| V15.3.1 | Only the required fields returned | ✅ | Explicit serializer fields; public views use separate serializers (profiles, published feedback without author or files); tests check that private fields are absent |

## Not changed, noted for later levels

- Session cookies `SameSite=Lax` rather than `Strict` (login from email links must work).
- No `Clear-Site-Data` header on logout; nothing authenticated is stored on the client.
- Level 2 items seen on the way (e.g. V7.1 session timeouts, V16 logging details) are left for a
  later review.
