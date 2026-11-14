# 0026 – Moderating people and published feedback

- Status: Accepted
- Date: 2026-11-14

## Context

Phase 7 of the MVP plan extends moderation (ADRs 0019–0021) to people and to published feedback
(master prompt 3.10). Until now only projects, campaigns and download links could be reported.
Published feedback (ADR 0024) is readable by everyone who sees the campaign and can carry spam or
insults; profiles (decision D) can impersonate others or contain inappropriate text.

The project owner decided (2026-11-14): reasons for people are spam, harassment or insults,
impersonation, inappropriate profile and other (free text optional); spam in published feedback is
hidden by moderators – reversible and logged; IP addresses stay out of the audit log (question T).
Account suspensions follow in WP 7.2.

## Decision

- **New report targets** `user` and `feedback` on `Report` (FKs SET_NULL like the other targets,
  `target_label` copy: `@name (/u/name)` and `title (/p/x/c/y/feedback/id)`).
- **Reasons per target kind**, checked by the server: content (project, campaign, link) keeps
  the six reasons of ADR 0019; people: spam, harassment, impersonation, inappropriate profile,
  other; feedback: spam, harassment, deception, legal, other.
- **Who may report:** signed in with a confirmed email (as before). A person is reported by
  username (case-insensitive) when their profile is visible, never oneself, not an account
  waiting for deletion or without a confirmed email; feedback only while it is **published**, by
  people who can read it, never one's own. Everything else answers 404. One open report per
  person and target, 20 per day (ADR 0019).
- **Moderating people:** warning (email to the person, note visible to moderators only) and
  dismissal. Blocking a person is refused (`not_supported`); suspensions are WP 7.2.
- **Hiding feedback:** a `Block` on the feedback sets `Feedback.blocked_at` and clears
  `published_at`, `publish_proposed_at` and `author_consented_at`: the feedback is private again.
  While blocked it is hidden also from the campaign's participants; the team and the author see it
  with the reason and the moderator's message; publishing is refused (`blocked`) until the block is
  lifted. The team gets the usual block email, the author an email too. As with other blocks only
  the team appeals, once. Lifting the block (or accepting the appeal) shows the feedback to the
  participants again, but it stays private until the team proposes and the author consents again.
- **Frontend:** "Report" on public profiles (not one's own) and on published feedback (not for the
  author or the team); the report form offers the reasons of the target kind; moderation queue and
  case page show people (`@name`, link to the profile, no block form, "Warn the person") and
  feedback (hide, show again).

## Alternatives

- Deleting reported feedback: not reversible, and the team loses the tester's report.
- Keeping hidden feedback published but masked: more states for little gain; making it private
  reuses the existing publishing rules.
- One reason list for everything: malware or "someone else's software" make no sense for people,
  harassment makes little sense for a download link.

## Consequences

- A person who is warned keeps all rights; repeated abuse needs the suspension of WP 7.2.
- Moderators still see only the title of reported feedback; purpose-bound access to private
  content follows in WP 7.3.
- Republishing hidden feedback needs the team and the author again – deliberate, so that lifting a
  block never makes text public on its own.
