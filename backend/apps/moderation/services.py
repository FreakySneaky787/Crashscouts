"""Reporting (WP 3B.2, ADR 0019).

Owner's decisions (2026-11-13): fixed reasons with optional free text; confirmed email; one open
report per account and content; 20 reports per day; only malware reports suspend content
automatically, and only a download link reported by 3 different accounts.
"""

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.campaigns.models import Campaign, CampaignLink
from apps.campaigns.policies import can_see_links
from apps.campaigns.selectors import campaign_for
from apps.projects.models import Membership, Project
from apps.projects.selectors import project_for
from apps.projects.services import has_confirmed_email

from .models import OPEN_STATES, Report

SUSPENSION_THRESHOLD = 3


class ReportError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class NotVisible(Exception):
    """The content does not exist for this person (answered with 404)."""


def resolve_target(user, target_type: str, project: str, campaign: str = "", link=None):
    """The reported object, if this person may see it; else NotVisible. Uses the same selectors
    as the pages, so nobody can report (or probe) what they cannot see."""
    found = project_for(user, project) if project else None
    if found is None:
        raise NotVisible
    if target_type == Report.TargetType.PROJECT:
        return found
    found_campaign = campaign_for(user, found, campaign) if campaign else None
    if found_campaign is None:
        raise NotVisible
    if target_type == Report.TargetType.CAMPAIGN:
        return found_campaign
    if target_type != Report.TargetType.LINK or not can_see_links(user, found_campaign):
        raise NotVisible
    found_link = (
        CampaignLink.objects.select_related("campaign__project")
        .filter(campaign=found_campaign, pk=link)
        .first()
    )
    if found_link is None or not found_link.is_served():
        raise NotVisible
    return found_link


def _label(target) -> str:
    if isinstance(target, Project):
        return f"{target.name} (/p/{target.slug})"
    if isinstance(target, Campaign):
        return f"{target.title} (/p/{target.project.slug}/c/{target.slug})"
    return f"{target.label} → {target.url} ({target.campaign.title})"


@transaction.atomic
def report(user, target, reason: str, text: str = "") -> Report:
    if not has_confirmed_email(user):
        raise ReportError("email_unconfirmed")
    if reason not in Report.Reason.values:
        raise ReportError("invalid_reason")
    if isinstance(target, Project):
        kind, field = Report.TargetType.PROJECT, "project"
    elif isinstance(target, Campaign):
        kind, field = Report.TargetType.CAMPAIGN, "campaign"
    else:
        kind, field = Report.TargetType.LINK, "link"
    if Report.objects.filter(
        reporter=user, target_type=kind, status__in=OPEN_STATES, **{field: target}
    ).exists():
        raise ReportError("already_reported")
    created = Report.objects.create(
        target_type=kind,
        target_label=_label(target)[:300],
        reporter=user,
        reason=reason,
        text=text.strip(),
        **{field: target},
    )
    # The free text stays out of the audit log (it may contain personal data).
    record(
        AuditEvent.Kind.REPORTED,
        actor=user,
        data={"target_type": kind, "target": str(target.pk), "reason": reason},
    )
    if kind == Report.TargetType.LINK and reason == Report.Reason.MALWARE:
        _maybe_suspend(target)
    return created


def _maybe_suspend(link: CampaignLink) -> None:
    link = (
        CampaignLink.objects.select_for_update().select_related("campaign__project").get(pk=link.pk)
    )
    if link.suspended_at is not None:
        return
    reporters = (
        Report.objects.filter(
            link=link,
            reason=Report.Reason.MALWARE,
            status__in=OPEN_STATES,
            reporter__isnull=False,
        )
        .values("reporter")
        .distinct()
        .count()
    )
    if reporters < SUSPENSION_THRESHOLD:
        return
    link.suspended_at = timezone.now()
    link.suspended_reason = Report.Reason.MALWARE
    link.save(update_fields=["suspended_at", "suspended_reason", "updated_at"])
    record(
        AuditEvent.Kind.LINK_SUSPENDED,
        data={"link": str(link.pk), "campaign": str(link.campaign_id), "reporters": reporters},
    )
    _tell_team(link)


def _tell_team(link: CampaignLink) -> None:
    campaign = link.campaign
    team = Membership.objects.filter(project=campaign.project).select_related("user")
    url = f"{settings.FRONTEND_URL}/p/{campaign.project.slug}/c/{campaign.slug}/edit"
    for member in team:
        if not member.user.email:
            continue
        context = {
            "username": member.user.username,
            "link_label": link.label,
            "campaign_title": campaign.title,
            "edit_url": url,
        }
        email = member.user.email
        transaction.on_commit(
            lambda email=email, context=context: get_adapter().send_mail(
                "moderation/email/link_suspended", email, context
            )
        )


def reports_of(user):
    return Report.objects.filter(reporter=user).order_by("-created_at")
