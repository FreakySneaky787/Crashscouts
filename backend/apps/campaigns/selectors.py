from apps.projects.models import Project
from apps.projects.validators import SLUG_PATTERN

from .models import Campaign, CampaignSlugHistory
from .policies import can_view


def campaign_for(user, project: Project, slug: str) -> Campaign | None:
    """The campaign behind a current or former short name, if the user may see it; else None.

    Unknown names, drafts and private campaigns of others all return None (callers answer 404).
    """
    slug = slug.lower()
    if not SLUG_PATTERN.fullmatch(slug):
        return None
    campaign = Campaign.objects.select_related("project").filter(project=project, slug=slug).first()
    if campaign is None:
        former = (
            CampaignSlugHistory.objects.select_related("campaign__project")
            .filter(project=project, slug=slug)
            .first()
        )
        campaign = former.campaign if former else None
    if campaign is None or not can_view(user, campaign):
        return None
    return campaign


def campaigns_of(user, project: Project) -> list[Campaign]:
    campaigns = Campaign.objects.select_related("project").filter(project=project)
    return [c for c in campaigns.prefetch_related("platforms") if can_view(user, c)]


def participant_count(campaign: Campaign) -> int:
    """Active participants; participations arrive in WP 3A.4."""
    return 0
