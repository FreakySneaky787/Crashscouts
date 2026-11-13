"""The only place that decides who may see or change a campaign (docs/ARCHITECTURE.md)."""

from django.conf import settings

from apps.projects import policies as project_policies
from apps.projects.models import Project

from .models import Campaign


def is_team(user, campaign: Campaign) -> bool:
    return project_policies.can_edit(user, campaign.project)


def public_campaigns_enabled() -> bool:
    """Security gate (phase 3B): only the project owner switches this, via the environment."""
    return settings.PUBLIC_CAMPAIGNS_ENABLED


def has_private_access(user, campaign: Campaign) -> bool:
    """Invited people and participants of a private campaign (WP 3A.4/3A.5); nobody yet."""
    return False


def can_view(user, campaign: Campaign) -> bool:
    if is_team(user, campaign):
        return True
    if campaign.state == Campaign.State.DRAFT:
        return False
    if campaign.visibility == Campaign.Visibility.PUBLIC:
        return (
            public_campaigns_enabled() and campaign.project.visibility == Project.Visibility.PUBLIC
        )
    return has_private_access(user, campaign)


def can_edit(user, campaign: Campaign) -> bool:
    return is_team(user, campaign)


def is_participant(user, campaign: Campaign) -> bool:
    """Active participant (WP 3A.4); nobody yet."""
    return False


def can_see_links(user, campaign: Campaign) -> bool:
    """Download links: only the team and participants (owner's decision, 2026-11-13)."""
    return is_team(user, campaign) or (can_view(user, campaign) and is_participant(user, campaign))
