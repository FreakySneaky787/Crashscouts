# 0020 – Moderation and blocking

- Status: Accepted
- Date: 2026-11-13

## Context

Gate items 2 and 6 of phase 3B: moderators block projects and campaigns immediately, links are no
longer served (not even to participants), blocks have a reason, are logged and reversible; a
moderation queue with the statuses open, in review, resolved, dismissed; the actions hide, block
and warn; feedback to the reporter; audit; moderation pages in the app. The project owner decided
(2026-11-13): the team keeps seeing blocked content with the reason but cannot change it; one
appeal per block; a warning emails the team and leaves a note for moderators only.

## Decision

1. **Denormalised flags** `blocked_at` on projects, campaigns and links, checked in the existing
   policy functions (`projects.policies.can_view`, `campaigns.policies.can_view`) and in
   `CampaignLink.is_served()`, so every page, list, image and link goes through the same check.
   Only the team sees blocked projects and campaigns; links of blocked or suspended content are
   served to **no one**, the team included. Teams cannot change blocked content (`blocked`), and
   invitations to blocked campaigns cannot be accepted.
2. **`Block`** records category (a report reason), message to the team, who blocked, lifting and
   the single appeal with its decision; at most one active block per target. **`ModerationNote`**
   keeps warnings for moderators.
3. **Actions** (moderators only, 404 otherwise): take a case (open → in review), block (closes
   the open reports as resolved), lift, warn (closes them as resolved, blocks nothing), dismiss
   (closes them as dismissed), lift a link suspension (dismisses the malware reports). "Hide" is
   the automatic link suspension of ADR 0019; moderators lift it or turn it into a block.
4. **Emails:** the team on block, lift, warning and appeal decision (with the moderators' message);
   reporters get a short note that their report was reviewed, without details about the other
   side. Audit events for every action; reporters' free text never enters the audit log.
5. **Queue order:** malware first, then suspended links, then the oldest report.
6. **Pages:** `/moderation` (cases and appeals) and `/moderation/<type>/<id>` (reports with
   reporter names, earlier warnings and blocks, actions with confirmation for block and dismiss);
   the team sees a notice with the reason and the appeal form on the project or campaign page.

## Alternatives

- Hiding blocked content from the team as well: rejected by the owner (the team must understand
  what happened).
- Automatic consequences after several warnings: rejected by the owner.
- Checking a separate block table on every request: the denormalised field keeps the central
  checks cheap and impossible to forget in queries.

## Consequences

- Moderators see reporter usernames; teams never do.
- A blocked project hides all its campaigns and links at once; lifting restores them.
