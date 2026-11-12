# 0009 – Account rules and password policy

- Status: Accepted
- Date: 2026-11-12

## Context

Phase 1 needs binding rules for login, identity, passwords, email verification and email
delivery. The project owner decided the product questions D, L and M (see
[`OPEN-QUESTIONS.md`](../OPEN-QUESTIONS.md)); this ADR records them together with the technical
consequences of WP 1.1.

## Decision

1. **Login by email only.** One account per email address, compared case-insensitively (allauth
   lowercases addresses; additionally a database constraint on `lower(email)`).
2. **Public username** as a separate handle: 3 to 30 characters `[a-z0-9_-]`, starting with a
   letter or digit, stored lowercase, unique (constraint on `lower(username)`), reserved names
   blocked. The username is not a login identifier, so knowing it does not help password guessing.
3. **Password policy (owner's decision):** minimum **12** characters, at most 256, no composition
   rules, Django's list of common passwords, no purely numeric passwords, no similarity to username
   or email. Hashing with Argon2id.
4. **Age:** self-declaration "at least 16" at signup; only the time of the declaration is stored,
   never a date of birth.
5. **Mandatory email verification** by link. Links point to the SSR frontend (`FRONTEND_URL`);
   opening a link does not confirm anything, a button (POST) does, because mail scanners open
   links automatically. Keys expire after 3 days and are single-use.
6. **No account enumeration:** signup with a registered address and password reset for an unknown
   address answer exactly like the success case. allauth's per-address cooldown (3 minutes) also
   limits the "account already exists" notice; no mail is sent to unknown addresses at all
   (`ACCOUNT_EMAIL_UNKNOWN_ACCOUNTS=False`), so the reset form cannot be used to mail strangers.
7. **Email delivery** through Django 6.1 `MAILERS` (SMTP, provider-neutral). Development and CI:
   Mailpit. Production provider: Scaleway Transactional Email (open question F, to be verified on
   the official pages before signing up).
8. **Signup switch** `DJANGO_SIGNUP_ENABLED` (production default: closed).
9. **Audit log foundation** (`apps.audit`): append-only at the ORM level, events for signup,
   email confirmation, login, failed login, logout, password change and reset; no IP addresses
   and no typed-in identifiers (open question T).

## Deviation from NIST SP 800-63B-4

NIST SP 800-63B-4 (July 2025) requires at least **15** characters for passwords used as a single
authentication factor and allows 8 only within multi-factor authentication. Our minimum of 12 is
below that for accounts without 2FA. Mitigations: blocklist and similarity checks, allauth rate
limits for login and reset, optional 2FA and passwordless passkey login in WP 1.3. The rule is to
be re-assessed before the platform goes public (phase 8).

## Alternatives

- 15 characters (NIST): recommended, not chosen by the owner.
- Login with email or username: rejected; the public username would be half of the credentials.
- Email confirmation on opening the link (GET): rejected; scanners would confirm addresses.
- Deprecated `EMAIL_*` settings: rejected; Django 6.1 deprecates them in favour of `MAILERS`
  (removal in Django 2028).

## Consequences

- Existing development data needs an email address per account; the E2E seed sets verified
  addresses on the reserved test domain `example.test` (RFC 2606).
- Rate limits use the per-process cache; a shared cache is required before the beta (open
  question O).
- Audit entries can still be changed with raw SQL; a database-level guard follows with the
  production setup.

## Sources

- NIST SP 800-63B-4: https://pages.nist.gov/800-63-4/sp800-63b.html ·
  FAQ: https://pages.nist.gov/800-63-4-Implementation-Resources/faqs/
- allauth settings and behaviour: source of the installed django-allauth 65.22.0
  (`account/app_settings.py`, `account/internal/flows/email_verification.py`,
  `socialaccount/app_settings.py`).
- Django 6.1 `MAILERS` and the deprecation of `EMAIL_*`: source of the installed Django 6.1.3
  (`django/conf/global_settings.py`, `django/core/mail/`).
- Mailpit v1.33.1 (MIT): https://github.com/axllent/mailpit (tag `v1.33.1`, `cmd/root.go` for
  `MP_DISABLE_VERSION_CHECK` and `MP_BLOCK_REMOTE_CSS_AND_FONTS`).
- RFC 2606 (reserved test domains): https://www.rfc-editor.org/rfc/rfc2606
