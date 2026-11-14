# Security gate checklist (phase 3B)

> For the project owner. Public campaigns stay locked (`PUBLIC_CAMPAIGNS_ENABLED=false`) until
> **every** line below is ticked. Only the project owner switches the flag, and records the date
> in [`STATUS.md`](STATUS.md). State: 2026-11-14, after WP 7.5.

## Part 1 – The eight gate items (code and tests)

All items are implemented and tested. CI runs every test below on every push to `main`; the
abuse case runs in its own Playwright run with the flag switched on for that run only
(`pnpm test:gate`, `e2e/playwright.gate.config.ts`).

| # | Gate item ([MVP-PLAN](MVP-PLAN.md)) | Implementation | Evidence (tests) | State |
|---|---|---|---|---|
| 1 | Reporting of projects, campaigns and single download links; reason, free text, rate limit; invitees of private campaigns can report | WP 3B.2, [ADR 0019](adr/0019-reporting-and-link-suspension.md) | `moderation/tests/test_reports.py` (each kind of content, invitees, rules, rate limit, auto-suspension after 3 malware reporters); E2E `tests/reports.spec.ts` | ✅ |
| 2 | Blocking: content hidden at once, links served to no one (team and participants included), with reason, logged, reversible | WP 3B.3, [ADR 0020](adr/0020-moderation-and-blocking.md) | `moderation/tests/test_moderation.py` (blocked project, campaign and link; the team cannot change it; lifting restores everything; audit events); E2E `tests/moderation.spec.ts`, `gate/abuse-case.spec.ts` | ✅ |
| 3 | Rate limits per user and IP for login, signup, reset, reports, campaign creation, invitations, uploads | WP 3B.5, [ADR 0022](adr/0022-rate-limits-and-shared-cache.md) | `core/tests/test_rate_limits.py` (per account, per IP, forged `X-Forwarded-For`, one trusted proxy, failed logins, signup, reset, hashed cache keys, every gate view); `core/tests/test_prod_settings.py` | ✅ |
| 4 | Verified email required to create campaigns and to report | WP 3A.1, WP 3B.2 | `campaigns/tests/test_campaigns.py::test_unconfirmed_team_members_cannot_create`, `moderation/tests/test_reports.py::test_rules_for_reporting` | ✅ |
| 5 | Review queue for every new public campaign; link changes trigger a new review | WP 3B.4, [ADR 0021](adr/0021-review-of-public-campaigns.md) | `moderation/tests/test_reviews.py` (waits for review, approval, rejection with reason, new and changed links wait); E2E `gate/abuse-case.spec.ts` | ✅ |
| 6 | Moderation workflow: open, in review, resolved, dismissed; hide, block, warn; feedback to reporters; audit log; moderation pages | WP 3B.3 | `moderation/tests/test_moderation.py` (queue, warning, dismissal, emails to team and reporters, appeals); E2E `tests/moderation.spec.ts` (with axe) | ✅ |
| 7 | Rule for owners of public campaigns (A: confirmed email and 2FA, no waiting period) | WP 3B.4 | `moderation/tests/test_reviews.py::test_rule_a_two_factor_is_required_to_submit`; roles need 2FA: `accounts/tests/test_roles.py` | ✅ |
| 8 | E2E abuse case: submit, review, approve, report link, block; afterwards the link is unreachable | WP 3B.6 | `e2e/gate/abuse-case.spec.ts`: warning page and link API answer 404 to the participant and to the team after the block; mutation check (block ignored when serving) makes it fail | ✅ |

The lock itself stays tested with the flag off: `campaigns/tests/test_campaigns.py::test_public_campaigns_cannot_be_published_while_locked`
and E2E `tests/campaigns.spec.ts` ("public campaigns stay drafts while the gate is closed").

## Part 2 – Before switching the flag in production (operations)

These depend on the production server, which does not exist yet. Tick each one on the real
server.

- [ ] Production settings (`config.settings.prod`) start without errors; `manage.py check --deploy`
      shows only the documented HSTS warnings.
- [ ] `DJANGO_TRUSTED_PROXY_COUNT=1`; the reverse proxy **overwrites** `X-Forwarded-For`,
      `X-Forwarded-Host` and `X-Forwarded-Proto` (never appends client values). Check: a request
      with a forged `X-Forwarded-For` does not change the address Django counts.
- [ ] Django is reachable only through the reverse proxy; the Django admin is not routed
      (`/admin/` → 404 from outside).
- [ ] Jobs: `manage.py purge_rate_limit_cache` hourly; `purge_deleted_accounts` and
      `purge_application_answers` daily.
- [ ] At least one moderator (or admin) account with 2FA; it can open `/moderation`.
- [ ] Outgoing email works (verification, reports, block notices); provider decided (open
      question F).
- [ ] Encrypted off-site backups of the database and uploaded files, with a **tested** restore.
- [ ] Real GitHub test on the test server (open question U), including the callback
      `<frontend>/projects/github/verify/callback`.
- [ ] Legal pages (terms, privacy, imprint) published for public content (see the legal section
      of [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)).
- [ ] ASVS 5.0 level 1 operations items ([`ASVS-L1-REVIEW.md`](ASVS-L1-REVIEW.md)): the proxy
      offers TLS 1.2 and 1.3 only (V12.1.1) with a publicly trusted certificate (V12.2.2), plain
      HTTP only redirects (V12.2.1); the deployed files contain no `.git` folder (V13.4.1); the
      browser receives `__Host-sessionid`, `__Host-csrftoken` and `Strict-Transport-Security` on
      every response (V3.3.1, V3.4.1).

## Part 3 – Deliberately open, known risks

- Published feedback can be reported and hidden since phase 7 (ADR 0026).

- Rate-limit values are provisional (ADR 0022); every limited request writes to PostgreSQL – to
  be measured before the beta.
- One moderator at the start (the owner, decision H): reviews and reports wait while the owner is
  away. Several moderators are supported since phase 7 (ADR 0028); any moderator may suspend and
  decide the appeal (no four-eyes principle, ADR 0027), reviewable in the admins' lists.
- IP addresses in the cache are HMAC hashes: pseudonymised, not anonymised (ADR 0022); deleted at
  most one day after the last request plus up to one hour until the hourly cleanup.
- No IP addresses in the audit log (open question T).
- Link checks are manual: the platform does not scan files (product boundary); reviewers see the
  URL and the optional SHA-256 checksum only.
- The OWASP ASVS level 1 review is planned before the closed beta, not as part of this gate.

## Part 4 – Switching

1. Every line in parts 1 and 2 is ticked; the owner accepts part 3.
2. The owner sets `PUBLIC_CAMPAIGNS_ENABLED=true` in the production environment and restarts
   Django.
3. The date and the person are recorded in `STATUS.md`.
4. Switching back is the same variable set to `false`: published public campaigns are then hidden
   again from everyone outside their team (tested in `test_campaigns.py`).
