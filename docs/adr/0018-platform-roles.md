# 0018 – Platform roles

- Status: Accepted
- Date: 2026-11-13

## Context

Phase 3B needs people who review public campaigns, handle reports and block abuse. The project
owner decided (2026-11-13): initially only the owner moderates, but the system is built
role-based (open question H), and roles are assigned on an admin page in the app. The Django
admin (`is_staff`) stays reachable only through an SSH tunnel ([`SECURITY.md`](../SECURITY.md),
section 7) and is not used for this.

## Decision

1. **One field** `User.platform_role`: none, `moderator` or `admin` (admins are moderators too).
2. **A role counts only with two-factor authentication** and only while the account is active and
   not scheduled for deletion (`apps/accounts/roles.py`, the single place for role checks).
   Without 2FA the stored role has no effect.
3. **Admin page** `/platform/roles` (not `/admin`, which the proxy blocks for the Django admin):
   list of roles with their 2FA state; granting and revoking needs the admin's **password** in the
   same request (the pattern of the project ownership transfer), is rate-limited
   (`account_sensitive`) and audited (`platform.role_changed` with old and new role). Everyone else
   gets 404.
4. **Targets** must be active, have a confirmed email address and 2FA turned on before they can
   get a role.
5. **The last admin cannot be demoted or removed**, not even by themselves; the check locks the
   admin rows, so two concurrent demotions cannot remove both.
6. **Bootstrap and emergency:** `manage.py set_platform_role <username> <admin|moderator|none>`
   on the server creates the first admin and is the way back in; audited with `via: command`.

## Alternatives

- Roles only through the server command: proposed, the owner chose the admin page.
- Django groups and permissions: more general than needed; one field keeps the checks obvious.
- Reusing `is_staff`: would mix the SSH-only Django admin with in-app moderation.
- allauth's reauthentication records: internal API of allauth; the password in the request is
  simpler and already used for the ownership transfer.

## Consequences

- Accounts without a usable password (GitHub or passkey only) cannot confirm role changes; they
  have to set a password first.
- Phases 3B.2–3B.4 use `is_moderator`/`is_admin` for the moderation and review pages.

## Sources

- allauth MFA: `allauth.mfa.utils.is_mfa_enabled` (django-allauth 65.22, installed package).
