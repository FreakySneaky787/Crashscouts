"""The only place that decides who may see or change feedback (ADR 0024).

- The team of the project sees and manages all feedback of its campaigns.
- The author always sees their own feedback (also after leaving); attachments too.
- Active participants of a campaign they can see read all of its feedback, without attachments.
- Published feedback (team proposed, author consented) is readable by everyone who can see the
  campaign, without attachments.
- Feedback of blocked campaigns and projects is hidden from everyone but the team (ADR 0020).
- Feedback hidden by moderators (WP 7.1) is seen only by the team and its author.
"""

from django.db.models import Q, QuerySet

from apps.campaigns import policies as campaign_policies
from apps.campaigns.models import Campaign

from .models import Feedback


def _blocked(campaign: Campaign) -> bool:
    return campaign.blocked_at is not None or campaign.project.blocked_at is not None


def is_team(user, campaign: Campaign) -> bool:
    return campaign_policies.is_team(user, campaign)


def is_author(user, feedback: Feedback) -> bool:
    return (
        getattr(user, "is_authenticated", False)
        and feedback.author_id is not None
        and feedback.author_id == user.pk
    )


def reads_all(user, campaign: Campaign) -> bool:
    """Team, or an active participant of a campaign they can see: every feedback of it."""
    if is_team(user, campaign):
        return True
    return campaign_policies.can_view(user, campaign) and campaign_policies.is_participant(
        user, campaign
    )


def can_view(user, feedback: Feedback) -> bool:
    campaign = feedback.campaign
    if is_team(user, campaign):
        return True
    if _blocked(campaign):
        return False
    if is_author(user, feedback):
        return True
    if feedback.blocked_at is not None:
        return False
    if reads_all(user, campaign):
        return True
    return feedback.published_at is not None and campaign_policies.can_view(user, campaign)


def visible_feedback(user, campaign: Campaign) -> QuerySet[Feedback]:
    """The feedback of a campaign the user may see (the campaign itself is already visible)."""
    feedback = Feedback.objects.filter(campaign=campaign)
    if is_team(user, campaign):
        return feedback
    if _blocked(campaign):
        return feedback.none()
    mine = Q(author=user) if getattr(user, "is_authenticated", False) else Q(pk__in=[])
    if reads_all(user, campaign):
        return feedback.filter(Q(blocked_at__isnull=True) | mine)
    return feedback.filter(Q(published_at__isnull=False, blocked_at__isnull=True) | mine)


def _team(user, feedback: Feedback, team: bool | None) -> bool:
    """``team``: already decided for the feedback's campaign by a list of one campaign (WP 8.6,
    one membership lookup per list instead of several per item)."""
    return is_team(user, feedback.campaign) if team is None else team


def can_see_attachments(user, feedback: Feedback, team: bool | None = None) -> bool:
    """Attachments: only the team and the author (owner's decision, 2026-11-14)."""
    if _team(user, feedback, team):
        return True
    return not _blocked(feedback.campaign) and is_author(user, feedback)


def can_see_author(user, feedback: Feedback, team: bool | None = None) -> bool:
    """Who wrote it: the team and the author; others see "a tester" (decision D: only the team
    sees who takes part)."""
    return _team(user, feedback, team) or is_author(user, feedback)
