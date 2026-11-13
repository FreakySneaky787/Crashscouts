# 0016 – Campaigns and status model

- Status: Accepted
- Date: 2026-11-13

## Context

Phase 3A introduces test campaigns (master prompt, section 3.5): six visible statuses (Draft, Open,
Full, In Progress, Completed, Cancelled), public or private visibility and three ways to take part.
Public campaigns must stay locked until the security gate of phase 3B is met
(`PUBLIC_CAMPAIGNS_ENABLED=false`). The project owner decided (2026-11-13, open question C and the
phase 3A round):

- the desired number of testers is a **hard limit** (automatically "Full");
- "In Progress" starts **automatically at the start date**;
- "Completed" is set **by the team by hand**;
- private campaigns take people **by invitation (username)** only;
- addresses are `/p/<project>/c/<campaign>`.

## Decision

1. **Only the team's decisions are stored** in `Campaign.state`: `draft`, `published`,
   `completed`, `cancelled`. The visible status is derived on every read
   (`apps/campaigns/status.py`): cancelled > completed > in progress (now ≥ start) > full
   (participants ≥ target) > open. No background job, nothing that can go stale.
2. **Transitions** (team only): draft → published or cancelled; published → completed or
   cancelled. Completed and cancelled campaigns are read-only. Only drafts can be deleted.
3. **Participation matches visibility**, enforced in the serializer and by a database constraint:
   private → `invitation`; public → `direct` or `approval`. Visibility and participation are frozen
   once published. Joining is possible while published and places are free, also while in
   progress (implemented in WP 3A.4 with a row lock).
4. **Public-campaign lock, server-side:** publishing a public campaign answers 403
   `public_campaigns_locked` while `PUBLIC_CAMPAIGNS_ENABLED` is off (the default; set only through
   the environment by the project owner). Even when it is on, a public campaign needs a public
   project and is visible to others only while the flag stays on.
5. **Visibility policy** (`apps/campaigns/policies.py`): the project team sees everything; drafts
   only the team; public campaigns everyone if the flag is on and the project is public; private
   campaigns the team plus invited people and participants (hook for WP 3A.4/3A.5). Everything
   else is a plain 404, also through former short names.
6. **Short names** are unique per project (case-insensitive) with history, so old addresses keep
   redirecting.
7. **Times with a time zone** (owner's decision, WP 3A.2): the team enters start and end as
   local date and time plus an IANA time zone (default `Europe/Zurich`). The SSR server converts
   them to UTC with the platform's `Intl` data; the campaign stores the instants and the zone
   name, and pages show the times in that zone. The backend validates the zone against the IANA
   database of the `tzdata` package (2026.6, Apache-2.0, Python Software Foundation), a direct
   dependency so the list does not depend on the server's operating system.
8. Creating needs a confirmed email address and is limited to 20 campaigns per day and person.
   State changes are audited (`campaign.created/published/completed/cancelled/deleted`).

## Alternatives

- Store all six statuses and update "Full"/"In Progress" with a scheduled job: rejected; needs a
  worker and can be wrong between runs.
- Complete automatically at the end date: rejected by the owner (manual completion).
- Allow private campaigns with open participation: rejected; private means invited only.

## Consequences

- The end date is information for testers; a campaign stays "In Progress" until the team
  completes it.
- Counting participants on every read costs one query per campaign; fine at MVP scale, can be
  annotated later.

## Sources

- Master prompt, sections 2.2 and 3.5 (`docs/MASTER-PROMPT.md`).
- Python `zoneinfo` and the `tzdata` package: https://docs.python.org/3/library/zoneinfo.html,
  https://pypi.org/project/tzdata/2026.6/ (version, licence and author checked in the installed
  package metadata).
- Django constraints (`CheckConstraint(condition=…)`, expressions in `UniqueConstraint`):
  https://docs.djangoproject.com/en/6.1/ref/models/constraints/
