# 0004 – Authentication with django-allauth

- Status: Accepted
- Date: 2026-11-12

## Context

Decided: email and password with verification, GitHub login, optional 2FA (TOTP, passkeys), and
⚑ mandatory 2FA for owners of public campaigns and for moderators. The frontend is an SSR app
talking to Django over HTTP. Building our own authentication would be an unnecessary security
risk.

## Decision

- `django-allauth` (MIT) in **headless mode** (`allauth.headless`) with `allauth.account`,
  `allauth.socialaccount` (GitHub) and `allauth.mfa` (TOTP, WebAuthn, recovery codes).
- Only the `browser` client is enabled (`HEADLESS_CLIENTS = ("browser",)`): authentication uses
  same-origin cookie sessions, never tokens in the browser.
- Custom user model from day one. Account and login identity are separate so that further
  providers can be added later.

### Current state (WP 0.4)

Only login, logout and the session endpoint are active. Signup is disabled
(`ACCOUNT_SIGNUP_ENABLED = False`) and the login method is provisionally `username`. Signup,
email rules, GitHub login and MFA follow in phase 1.

## Alternatives

- **Own implementation:** high risk of mistakes.
- **dj-rest-auth or JWT solutions:** tokens in the browser widen the attack surface under XSS;
  MFA would have to be solved separately.

## Consequences

- allauth updates must be followed closely because security fixes appear regularly.
- How the Django admin login is tied to MFA will be verified in the official docs during
  implementation.
- allauth's rate limits use Django's cache. The default per-process memory cache is not
  sufficient for production with several processes; a shared cache must be configured before the
  beta (see [`OPEN-QUESTIONS.md`](../OPEN-QUESTIONS.md)).

## Sources

- [allauth: headless installation](https://docs.allauth.org/en/latest/headless/installation.html)
- [allauth: WebAuthn](https://docs.allauth.org/en/latest/mfa/webauthn.html)
- [PyPI: django-allauth](https://pypi.org/project/django-allauth/): version 65.22.0 on
  2026-11-12, declares Django 4.2 to 6.1 and Python 3.11 to 3.14.
- Setting names verified in the installed source (65.22.0): `allauth/headless/app_settings.py`,
  `allauth/account/app_settings.py` (`SIGNUP_ENABLED`, `LOGIN_METHODS`, `RATE_LIMITS`).
