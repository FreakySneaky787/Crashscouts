# 0013 – Account deletion and personal data export

- Status: Accepted
- Date: 2026-11-12

## Context

The project owner decided: deleting an account hides it at once, signing in within 14 days
cancels the deletion, afterwards the account is deleted for good; feedback is anonymised, not
deleted. Users can export their data as JSON (GDPR art. 15 and 20; Swiss FADP art. 25 and 28).

## Decision

1. **Grace period as a field** `deletion_scheduled_for` on the user (not `is_active=False`), so
   that signing in keeps working and cancels the deletion (receiver on `user_logged_in`).
   Profiles and avatars of such accounts are invisible at once (`visible_profiles()`).
2. **Confirmation by the current password** for deletion and export, plus an explicit checkbox for
   deletion; both endpoints are throttled (10 per hour). Accounts without a password (GitHub only)
   set one with "Forgot your password?" first – one simple rule for everyone.
3. **Signed out everywhere** on a deletion request. Django keeps no index from users to sessions;
   the sessions are scanned. Fine at the current scale; to be revisited (e.g. allauth
   user sessions) when the number of sessions grows.
4. **Final deletion** by `manage.py purge_deleted_accounts`, run daily on the server (systemd timer
   or cron, set up with the production deployment). It deletes the user (cascading to profile,
   email addresses, 2FA, GitHub links), the avatar file, and records `account.deleted` without any
   reference to the person; earlier audit events lose their user references. Phase 5 must extend
   it so that feedback is anonymised, not deleted.
5. **Emails:** deletion scheduled, deletion cancelled, account deleted (last message).
6. **Export** (`/api/v1/me/export/`, download via the SSR resource route `/account/export`):
   account, email addresses, profile with visibility switches, connected accounts, types of
   two-factor methods, security log. Never: password hashes, TOTP secrets, recovery codes, passkey
   keys, other people's data. `Cache-Control: private, no-store`.

## Consequences

- Production needs a daily job for `purge_deleted_accounts`.
- Every future model with personal data must be added to the export and to the purge (or be
  anonymised there); this is part of the definition of done of the phases that add such models.

## Sources

- GDPR art. 15 (right of access), 17 (erasure), 20 (portability): https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Swiss FADP art. 25 (right of access), 28 (data portability): https://www.fedlex.admin.ch/eli/cc/2022/491/de
