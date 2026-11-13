"""Download links of campaigns (WP 3A.3). The server never fetches them."""

from urllib.parse import urlsplit

from django.db import transaction

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.projects.repositories import parse_repository_url
from apps.projects.verification import verified_method

from .models import Campaign, CampaignLink
from .services import CampaignError


def host_of(url: str) -> str:
    return (urlsplit(url).hostname or "").rstrip(".")


def in_verified_repository(link: CampaignLink) -> bool:
    """True if the link points into the project's verified repository, e.g. its releases.

    Same host as the repository and a path below /<owner>/<repository>/ (case-insensitive, as
    the code hosts treat owner and repository names).
    """
    project = link.campaign.project
    if not project.repository_url or verified_method(project) is None:
        return False
    ref = parse_repository_url(project.repository_url)
    if ref is None:
        return False
    parts = urlsplit(link.url)
    repo_host = urlsplit(project.repository_url).hostname
    prefix = "/" + "/".join(ref.segments).lower() + "/"
    return parts.hostname == repo_host and (parts.path.lower() + "/").startswith(prefix)


def _audit(kind, user, link: CampaignLink) -> None:
    record(
        kind,
        actor=user,
        data={
            "campaign": str(link.campaign_id),
            "link": str(link.pk),
            "host": host_of(link.url),
        },
    )


def _ensure_open(campaign: Campaign) -> None:
    if campaign.state in (Campaign.State.COMPLETED, Campaign.State.CANCELLED):
        raise CampaignError("campaign_closed")


@transaction.atomic
def add_link(user, campaign: Campaign, **fields) -> CampaignLink:
    campaign = Campaign.objects.select_for_update().get(pk=campaign.pk)
    _ensure_open(campaign)
    count = CampaignLink.objects.filter(campaign=campaign).count()
    if count >= CampaignLink.MAX_PER_CAMPAIGN:
        raise CampaignError("too_many_links")
    link = CampaignLink.objects.create(campaign=campaign, position=count, **fields)
    _audit(AuditEvent.Kind.CAMPAIGN_LINK_ADDED, user, link)
    return link


def _ensure_not_suspended(link: CampaignLink) -> None:
    if link.suspended_at is not None:
        raise CampaignError("link_suspended")  # decided by moderators (WP 3B.3)


@transaction.atomic
def change_link(user, link: CampaignLink, **fields) -> CampaignLink:
    _ensure_open(link.campaign)
    _ensure_not_suspended(link)
    for key, value in fields.items():
        setattr(link, key, value)
    link.save()
    # Phase 3B: a changed link of an approved public campaign goes back to review.
    _audit(AuditEvent.Kind.CAMPAIGN_LINK_CHANGED, user, link)
    return link


@transaction.atomic
def remove_link(user, link: CampaignLink) -> None:
    _ensure_open(link.campaign)
    _ensure_not_suspended(link)
    _audit(AuditEvent.Kind.CAMPAIGN_LINK_REMOVED, user, link)
    link.delete()
