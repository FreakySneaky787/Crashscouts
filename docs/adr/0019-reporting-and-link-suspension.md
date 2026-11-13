# 0019 – Reporting and automatic link suspension

- Status: Accepted
- Date: 2026-11-13

## Context

Gate item 1 of phase 3B: projects, campaigns and individual download links can be reported
(reason, free text, rate limit), also by invitees of private campaigns. Gate item 4: reporting
needs a confirmed email address. The project owner decided (2026-11-13): a short list of reasons
with optional free text, malware first; reporters see the status and get a short email when a
report is closed; at most 20 reports per day and one open report per account and content; only
malware reports suspend content automatically – a download link after 3 different accounts
reported it.

## Decision

1. **App `moderation`, model `Report`:** target type and one of project, campaign or link
   (`SET_NULL`, plus a copy `target_label`, so cases stay readable after deletion); reporter
   (`SET_NULL` on account deletion); reason (malware, deception, not own software, spam, legal,
   other); free text up to 1000 characters; status open, in review, resolved, dismissed (the
   moderation workflow follows in WP 3B.3).
2. **Only what one can see can be reported:** the target is resolved through the same selectors
   as the pages (`project_for`, `campaign_for`, `can_see_links`); everything else is 404, so
   reporting cannot be used to probe for hidden content.
3. **Limits:** confirmed email (403 otherwise), one open report per account and content (database
   constraint), 20 per day (`report` throttle scope).
4. **Automatic suspension:** when 3 different accounts have open malware reports for a download
   link, it gets `suspended_at` and is **served to no one** – the warning page is 404 for
   everyone, participants no longer see it, the team sees it marked "suspended – under review"
   and cannot change or remove it; the team is emailed; audited (`moderation.link_suspended`).
   Lifting or confirming is the moderators' decision (WP 3B.3).
5. **Privacy:** the audit log records target and reason but never the free text; the project team
   does not learn who reported; reporters find their reports on the account page and in the data
   export.

## Alternatives

- Automatic hiding for every reason: rejected by the owner (easy to abuse against unwelcome
  projects).
- No automatic action: rejected by the owner (a dangerous link would stay reachable until a
  moderator acts).
- Anonymous reports by visitors: rejected; gate item 4 requires a confirmed email.

## Consequences

- Three coordinated accounts with confirmed emails who take part in the campaign can suspend a
  link until a moderator decides; the queue (WP 3B.3) must show such cases first.
- Because of the "one open report per account and content" constraint, counting reports and
  counting distinct reporters give the same number; the distinct count stays as a second guard.
