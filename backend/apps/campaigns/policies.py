"""The only place that decides who may see or change a campaign (docs/ARCHITECTURE.md)."""

from django.conf import settings
from django.utils import timezone

from apps.projects import policies as project_policies
from apps.projects.models import Project

from .models import Campaign, CampaignInvitation, Participation


def is_team(user, campaign: Campaign) -> bool:
    return project_policies.can_edit(user, campaign.project)


def public_campaigns_enabled() -> bool:
    """Security gate (phase 3B): only the project owner switches this, via the environment."""
    return settings.PUBLIC_CAMPAIGNS_ENABLED


def has_private_access(user, campaign: Campaign) -> bool:
    """Participants and people with an open invitation see a published private campaign."""
    if not getattr(user, "is_authenticated", False):
        return False
    return (
        is_participant(user, campaign)
        or CampaignInvitation.objects.filter(
            campaign=campaign,
            invitee=user,
            status=CampaignInvitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).exists()
    )


def can_view(user, campaign: Campaign) -> bool:
    if is_team(user, campaign):
        return True
    if campaign.state in (Campaign.State.DRAFT, Campaign.State.IN_REVIEW):
        return False
    if campaign.blocked_at is not None or campaign.project.blocked_at is not None:
        return False  # blocked by moderators: gone for invitees and participants too
    if campaign.visibility == Campaign.Visibility.PUBLIC:
        return (
            public_campaigns_enabled() and campaign.project.visibility == Project.Visibility.PUBLIC
        )
    return has_private_access(user, campaign)


def can_edit(user, campaign: Campaign) -> bool:
    return is_team(user, campaign)


def is_participant(user, campaign: Campaign) -> bool:
    if not getattr(user, "is_authenticated", False):
        return False
    return Participation.objects.filter(
        campaign=campaign, user=user, status=Participation.Status.ACTIVE
    ).exists()


def can_see_links(user, campaign: Campaign) -> bool:
    """Download links: only the team and participants (owner's decision, 2026-11-13)."""
    return is_team(user, campaign) or (can_view(user, campaign) and is_participant(user, campaign))
