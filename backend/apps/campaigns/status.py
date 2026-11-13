"""The status a campaign shows (WP 3A.1, decision C of 2026-11-13; ADR 0016).

Only the team's decisions are stored (draft, published, completed, cancelled). "Open", "Full" and
"In Progress" follow from the start date and the number of participants whenever the campaign is
read, so no background job is needed and no status can be out of date.

Precedence: cancelled > completed > in progress (from the start date) > full (participant limit
reached; a hard limit) > open.
"""

from datetime import datetime

DRAFT = "draft"
IN_REVIEW = "in_review"  # public campaigns wait for moderators (WP 3B.4, ADR 0021)
PUBLISHED = "published"
COMPLETED = "completed"
CANCELLED = "cancelled"

OPEN = "open"
FULL = "full"
IN_PROGRESS = "in_progress"

# Allowed changes of the stored state, all by the team.
# Approval (in review -> published) and rejection (in review -> draft) are moderators' actions,
# not team transitions; a team's "publish" of a public campaign becomes "submit for review".
TRANSITIONS = {
    DRAFT: {PUBLISHED, CANCELLED},
    IN_REVIEW: {CANCELLED},
    PUBLISHED: {COMPLETED, CANCELLED},
    COMPLETED: set(),
    CANCELLED: set(),
}


def effective_status(
    state: str, *, starts_at: datetime, now: datetime, participants: int, target: int
) -> str:
    if state in (DRAFT, IN_REVIEW, COMPLETED, CANCELLED):
        return state
    if now >= starts_at:
        return IN_PROGRESS
    if participants >= target:
        return FULL
    return OPEN


def accepts_participants(state: str, *, participants: int, target: int) -> bool:
    """Joining is possible while published and places are free (also while in progress)."""
    return state == PUBLISHED and participants < target


def can_transition(current: str, new: str) -> bool:
    return new in TRANSITIONS.get(current, set())
