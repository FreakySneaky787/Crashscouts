# 0021 – Review of public campaigns

- Status: Accepted
- Date: 2026-11-13

## Context

Gate item 5 of phase 3B: every new public campaign goes through a review queue, and changes to the
download links of an approved campaign trigger a new review. Gate item 7 / open question A: whoever
publishes public campaigns needs a confirmed email and two-factor authentication (no waiting
period). The project owner decided (2026-11-13): when a link of an approved campaign changes, only
that link waits (the campaign and its reviewed links stay available); only link changes are
reviewed again, not texts.

## Decision

1. **New stored state `in_review`.** A team's "publish" of a public campaign becomes "submit for
   review" (`draft → in_review`); moderators approve (`in_review → published`) or send it back
   with a reason (`in_review → draft`, `review_note`). The team may cancel while in review. Private
   campaigns publish without review as before. `PUBLIC_CAMPAIGNS_ENABLED` still refuses submitting
   while the gate is closed.
2. **Rule A on submitting:** confirmed email and active 2FA of the submitting team member
   (`needs_2fa`); the project must be public.
3. **Visibility:** in review, only the team sees the campaign; visibility and participation are
   frozen, texts and links stay editable, questions are frozen.
4. **Link review:** `CampaignLink.review_status` (approved, pending, rejected) and `review_note`.
   New links of public campaigns start pending; a changed URL or checksum sends a link back to
   pending (label and platform do not). `is_served()` requires `approved`. Approving a campaign
   approves its pending links; single pending links of published campaigns are approved or
   rejected individually; rejected links are served to no one.
5. **Metrics:** `published_at` is set on approval (when the campaign goes live); `published_by` is
   the submitting account (docs/METRICS.md).
6. **Status shown:** "In Review" is an additional status beyond the six of the master prompt,
   visible to the team only.
7. **Moderation:** `/api/v1/moderation/reviews/` (campaigns in review with all their links, and
   pending links of published campaigns, oldest first) and approve/reject endpoints; emails to the
   team; audit events.

## Alternatives

- Hiding the whole campaign while a changed link waits: rejected by the owner (interrupts running
  tests).
- Reviewing text changes as well: rejected by the owner (much more review work; reports cover it).

## Consequences

- Moderators review every new public campaign and every new or changed public download link; the
  queue is the bottleneck for going public.
- Existing links were marked approved by the migration (only private campaigns existed so far).
