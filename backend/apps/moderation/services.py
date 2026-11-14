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
from apps.feedback import policies as feedback_policies
from apps.feedback.models import Feedback
from apps.profiles.selectors import visible_profiles
from apps.projects.models import Membership, Project
from apps.projects.selectors import project_for
from apps.projects.services import has_confirmed_email

from .models import OPEN_STATES, Report

SUSPENSION_THRESHOLD = 3

R = Report.Reason
# Reasons per kind of target (owner's decisions 2026-11-13 and 2026-11-14).
CONTENT_REASONS = {R.MALWARE, R.DECEPTION, R.NOT_OWN_SOFTWARE, R.SPAM, R.LEGAL, R.OTHER}
USER_REASONS = {R.SPAM, R.HARASSMENT, R.IMPERSONATION, R.INAPPROPRIATE_PROFILE, R.OTHER}
FEEDBACK_REASONS = {R.SPAM, R.HARASSMENT, R.DECEPTION, R.LEGAL, R.OTHER}


class ReportError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class NotVisible(Exception):
    """The content does not exist for this person (answered with 404)."""


def resolve_target(
    user,
    target_type: str,
    project: str = "",
    campaign: str = "",
    link=None,
    *,
    username: str = "",
    feedback=None,
):
    """The reported object, if this person may see it; else NotVisible. Uses the same selectors
    as the pages, so nobody can report (or probe) what they cannot see."""
    if target_type == Report.TargetType.USER:
        # Visible profiles only (active, confirmed, not waiting for deletion); not oneself.
        found_profile = visible_profiles().filter(user__username__iexact=username).first()
        if found_profile is None or found_profile.user_id == user.pk:
            raise NotVisible
        return found_profile.user
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
    if target_type == Report.TargetType.FEEDBACK:
        # Published feedback only (owner's decision); the author does not report their own.
        found_feedback = (
            Feedback.objects.select_related("campaign__project")
            .filter(campaign=found_campaign, pk=feedback, published_at__isnull=False)
            .first()
        )
        if (
            found_feedback is None
            or not feedback_policies.can_view(user, found_feedback)
            or feedback_policies.is_author(user, found_feedback)
        ):
            raise NotVisible
        return found_feedback
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


def kind_of(target) -> tuple[str, str]:
    """The report's target type and the field that holds the target."""
    if isinstance(target, Project):
        return Report.TargetType.PROJECT, "project"
    if isinstance(target, Campaign):
        return Report.TargetType.CAMPAIGN, "campaign"
    if isinstance(target, CampaignLink):
        return Report.TargetType.LINK, "link"
    if isinstance(target, Feedback):
        return Report.TargetType.FEEDBACK, "feedback"
    return Report.TargetType.USER, "user"


def reasons_for(kind: str) -> set[str]:
    if kind == Report.TargetType.USER:
        return USER_REASONS
    if kind == Report.TargetType.FEEDBACK:
        return FEEDBACK_REASONS
    return CONTENT_REASONS


def _label(target) -> str:
    if isinstance(target, Feedback):
        campaign = target.campaign
        return f"{target.title} (/p/{campaign.project.slug}/c/{campaign.slug}/feedback/{target.pk})"
    if not isinstance(target, Project | Campaign | CampaignLink):
        return f"@{target.username} (/u/{target.username})"
    if isinstance(target, Project):
        return f"{target.name} (/p/{target.slug})"
    if isinstance(target, Campaign):
        return f"{target.title} (/p/{target.project.slug}/c/{target.slug})"
    return f"{target.label} → {target.url} ({target.campaign.title})"


@transaction.atomic
def report(user, target, reason: str, text: str = "") -> Report:
    if not has_confirmed_email(user):
        raise ReportError("email_unconfirmed")
    kind, field = kind_of(target)
    if reason not in reasons_for(kind):
        raise ReportError("invalid_reason")
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
