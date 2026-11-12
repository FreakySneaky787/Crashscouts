# 0011 – Two-factor authentication

- Status: Accepted (WP 1.3a: authenticator app and recovery codes; WP 1.3b: passkeys)
- Date: 2026-11-12

## Context

The project owner decided that two-factor authentication (2FA) is optional for all users and that
the platform offers an authenticator app (TOTP), recovery codes, passkeys and passwordless passkey
login. A mandatory 2FA for owners of public campaigns and moderators is proposed for the security
gate (phase 3B, open question A).

## Decision

1. **django-allauth MFA** (`allauth.mfa`, headless) with `MFA_SUPPORTED_TYPES = ["totp",
   "recovery_codes", "webauthn"]`. Extra packages from allauth's `mfa` extra: `fido2` 2.2.1
   (BSD-2-Clause) and `qrcode` 8.2 (BSD).
2. **TOTP:** 6 digits, 30-second steps, tolerance of one step for clock drift; a code cannot be
   used twice. Turning TOTP on creates 10 single-use recovery codes.
3. **Confirmation before security changes:** allauth requires an explicit reauthentication for
   every 2FA change (the original login does not count), valid for 5 minutes. Allowed methods are
   **password or a second factor only** (`ACCOUNT_REAUTHENTICATION_METHODS`). The default would
   also accept a code sent by email; whoever controls the mailbox must not be able to change the
   second factor.
4. **Security notifications by email** (`ACCOUNT_EMAIL_NOTIFICATIONS`): password changed, second
   factor added or removed. Few messages; they let owners notice changes made by someone else.
5. **Audit log:** events `mfa.added`, `mfa.removed`, `mfa.reset`, `mfa.failed` (type only, no codes).
6. **QR code** for the authenticator app is rendered on the server as an SVG from the module matrix
   (`uqr` 0.1.3, MIT, no dependencies): no image request, no `data:` URL (CSP), no inner HTML.
   Dark modules on a light ground in both themes, so every scanner can read it. The key is also
   shown as text for manual entry.
7. **Passkeys (WebAuthn):** the relying party ID is the host of `FRONTEND_URL`, not the internal
   backend host (allauth's default would use the request host, e.g. `django` behind Docker).
   WebAuthn does not accept IP addresses as relying party, so local development and E2E use
   `localhost`.
8. All steps except passkeys work **without JavaScript**; passkeys need the browser's WebAuthn API.

## Alternatives

- 2FA mandatory for everyone: rejected by the owner (optional, volunteer platform).
- Rendering the QR code with the Python `qrcode` package and embedding it as an image: needs a
  `data:` URL or an extra image route; the SVG from the matrix is simpler and CSP-friendly.

## Consequences

- Login has a second step (`/login/2fa`); security settings live at `/settings/security` and send
  the user through `/reauthenticate` when a confirmation is due.
- allauth sends notification and 2FA emails after the database commit; the account adapter builds
  the email context without the request (see `apps/accounts/adapter.py`).

## Sources

- django-allauth 65.22.0 MFA and reauthentication behaviour: source of the installed package
  (`allauth/mfa/app_settings.py`, `allauth/account/internal/flows/reauthentication.py`,
  `allauth/mfa/adapter.py`, `allauth/headless/mfa/urls.py`).
- TOTP: RFC 6238, https://www.rfc-editor.org/rfc/rfc6238
- WebAuthn relying party identifier: https://www.w3.org/TR/webauthn-3/#relying-party-identifier
- fido2 2.2.1 and qrcode 8.2: PyPI metadata (https://pypi.org/project/fido2/, https://pypi.org/project/qrcode/)
- uqr 0.1.3: npm registry metadata (https://www.npmjs.com/package/uqr)
