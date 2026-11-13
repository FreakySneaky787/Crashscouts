"""Review of public campaigns and their download links (WP 3B.4, ADR 0021).

Gate item 5: every new public campaign goes through review; a link change of an approved campaign
triggers a new review. Owner's decisions (2026-11-13): only the new or changed link waits (the
campaign and its reviewed links stay available); only link changes are reviewed again.
"""

from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.campaigns.models import Campaign, CampaignLink

from .actions import ModerationError, _mail_team

MESSAGE_MAX_LENGTH = 1000


def pending_campaigns():
    return (
        Campaign.objects.filter(state=Campaign.State.IN_REVIEW, blocked_at__isnull=True)
        .select_related("project")
        .prefetch_related("links")
        .order_by("updated_at")
    )


def pending_links():
    """Waiting links of campaigns that are already published (the others go with the campaign)."""
    return (
        CampaignLink.objects.filter(
            review_status=CampaignLink.Review.PENDING,
            campaign__state=Campaign.State.PUBLISHED,
            blocked_at__isnull=True,
        )
        .select_related("campaign__project")
        .order_by("updated_at")
    )


def _message(message: str) -> str:
    text = (message or "").strip()
    if not text:
        raise ModerationError("message_required")
    if len(text) > MESSAGE_MAX_LENGTH:
        raise ModerationError("too_long")
    return text


@transaction.atomic
def approve_campaign(campaign: Campaign, by) -> None:
    campaign = Campaign.objects.select_for_update().select_related("project").get(pk=campaign.pk)
    if campaign.state != Campaign.State.IN_REVIEW:
        raise ModerationError("not_in_review")
    campaign.state = Campaign.State.PUBLISHED
    campaign.published_at = timezone.now()  # metrics: published when it went live
    campaign.review_note = ""
    campaign.save(update_fields=["state", "published_at", "review_note", "updated_at"])
    CampaignLink.objects.filter(
        campaign=campaign, review_status=CampaignLink.Review.PENDING
    ).update(review_status=CampaignLink.Review.APPROVED, review_note="")
    record(AuditEvent.Kind.CAMPAIGN_APPROVED, actor=by, data={"campaign": str(campaign.pk)})
    _mail_team(
        campaign.project,
        "moderation/email/review_decided",
        {"what": f'the campaign "{campaign.title}"', "approved": True, "message": ""},
    )


@transaction.atomic
def reject_campaign(campaign: Campaign, by, message: str) -> None:
    text = _message(message)
    campaign = Campaign.objects.select_for_update().select_related("project").get(pk=campaign.pk)
    if campaign.state != Campaign.State.IN_REVIEW:
        raise ModerationError("not_in_review")
    campaign.state = Campaign.State.DRAFT
    campaign.review_note = text
    campaign.save(update_fields=["state", "review_note", "updated_at"])
    record(AuditEvent.Kind.CAMPAIGN_REJECTED, actor=by, data={"campaign": str(campaign.pk)})
    _mail_team(
        campaign.project,
        "moderation/email/review_decided",
        {"what": f'the campaign "{campaign.title}"', "approved": False, "message": text},
    )


def _pending_link(link: CampaignLink) -> CampaignLink:
    link = (
        CampaignLink.objects.select_for_update().select_related("campaign__project").get(pk=link.pk)
    )
    if link.review_status != CampaignLink.Review.PENDING:
        raise ModerationError("not_in_review")
    return link


@transaction.atomic
def approve_link(link: CampaignLink, by) -> None:
    link = _pending_link(link)
    link.review_status, link.review_note = CampaignLink.Review.APPROVED, ""
    link.save(update_fields=["review_status", "review_note", "updated_at"])
    record(AuditEvent.Kind.LINK_APPROVED, actor=by, data={"link": str(link.pk)})


@transaction.atomic
def reject_link(link: CampaignLink, by, message: str) -> None:
    text = _message(message)
    link = _pending_link(link)
    link.review_status, link.review_note = CampaignLink.Review.REJECTED, text
    link.save(update_fields=["review_status", "review_note", "updated_at"])
    record(AuditEvent.Kind.LINK_REJECTED, actor=by, data={"link": str(link.pk)})
    _mail_team(
        link.campaign.project,
        "moderation/email/review_decided",
        {
            "what": f'the download link "{link.label}" of the campaign "{link.campaign.title}"',
            "approved": False,
            "message": text,
        },
    )
