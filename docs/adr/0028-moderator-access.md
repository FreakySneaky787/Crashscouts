# 0028 – Several moderators and purpose-bound access

- Status: Accepted
- Date: 2026-11-14

## Context

Master prompt 3.10: private content is not open to all moderators by default. Phase 7 asks for
several moderators with purpose-bound, logged access. Until now the case page showed the reports,
the title and, for download links, the address; nothing else of the reported content.

The project owner decided (2026-11-14): access only to the reported object, only after taking the
case, with a required reason, valid for 24 hours, in the audit log; admins see a list of all
accesses; the team is not notified.

## Decision

- **Taking a case:** "take" marks the open reports as in review and stores the moderator
  (`Report.taken_by`); the queue and the case page show "in review by …". Another moderator may
  take the case over; all moderators may still act. Taking is an audit event.
- **`ModeratorAccess`:** moderator, the reported project, campaign or feedback (SET_NULL, with a
  copy of the label), reason (at most 500 characters), `expires_at` = opening + 24 hours, number of
  views. Opened through `POST /api/v1/moderation/cases/<type>/<id>/access/` only by the moderator
  who took the open case (`take_first` otherwise) and only with a reason; opening it again while it
  is valid returns the same access. People and download links need none: their case page already
  shows everything moderators may see.
- **Read-only view:** `GET /api/v1/moderation/accesses/<id>/` answers only for the moderator who
  opened it and only while valid (404 otherwise, also for admins). It returns a copy of the
  content: texts as plain text, download links as text (the moderation area never opens them),
  attached files by name only. Every view is counted and audited.
- **Admins' list:** `GET /api/v1/moderation/accesses/` (admins only) with moderator, content,
  reason, time, state and number of views; frontend `/moderation/accesses`.
- **No notification of the team** (owner's decision).

## Alternatives

- Moderators see all content of reported objects: contrary to master prompt 3.10.
- A second person approves each access: too heavy with one moderator at the start.
- Showing the live pages of private content to moderators: would mix moderation into every
  permission check; a separate read-only copy keeps the policies unchanged.

## Consequences

- Moderators need one extra step (take, reason) before reading reported content.
- The audit log and the admins' list make every access reviewable; the reason is stored with the
  access, not in the audit event.
- An access stays valid for its 24 hours even if the case is closed meanwhile.
