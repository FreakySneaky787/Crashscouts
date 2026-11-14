"""Writes for feedback (ADR 0024). Views stay thin; who may see what is in policies.py."""

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.campaigns.models import Campaign, Participation
from apps.campaigns.services import CampaignError, ensure_unblocked

from . import policies
from .models import Feedback, FeedbackStatusChange

# Statuses the team sets; any change between them is allowed (ADR 0024).
TEAM_STATUSES = {
    Feedback.Status.REVIEWED,
    Feedback.Status.CONFIRMED,
    Feedback.Status.IN_PROGRESS,
    Feedback.Status.FIXED,
    Feedback.Status.DUPLICATE,
    Feedback.Status.CANNOT_REPRODUCE,
    Feedback.Status.REJECTED,
}
# The author confirms a fix, or reopens it (owner's decision, 2026-11-14).
AUTHOR_STATUSES = {Feedback.Status.VERIFIED, Feedback.Status.CONFIRMED}


class FeedbackError(CampaignError):
    """A refused change; ``code`` goes to the frontend."""


def _locked(feedback: Feedback) -> Feedback:
    return (
        # Lock only the feedback row: the author is a nullable join, which PostgreSQL refuses.
        Feedback.objects.select_for_update(of=("self",))
        .select_related("campaign__project", "author")
        .get(pk=feedback.pk)
    )


@transaction.atomic
def create_feedback(campaign: Campaign, user, **fields) -> Feedback:
    """Active participants of a published, unblocked campaign give feedback."""
    campaign = Campaign.objects.select_related("project").get(pk=campaign.pk)
    ensure_unblocked(campaign)
    if campaign.state != Campaign.State.PUBLISHED:
        raise FeedbackError("campaign_closed")
    if not Participation.objects.filter(
        campaign=campaign, user=user, status=Participation.Status.ACTIVE
    ).exists():
        raise FeedbackError("not_participant")
    return Feedback.objects.create(campaign=campaign, author=user, **fields)


def ensure_author_can_change(feedback: Feedback, user) -> None:
    ensure_unblocked(feedback.campaign)
    if not policies.is_author(user, feedback):
        raise FeedbackError("not_author")
    if feedback.status != Feedback.Status.NEW:
        raise FeedbackError("feedback_locked")  # the team already looked at it


@transaction.atomic
def change_feedback(feedback: Feedback, user, **fields) -> Feedback:
    feedback = _locked(feedback)
    ensure_author_can_change(feedback, user)
    for key, value in fields.items():
        setattr(feedback, key, value)
    feedback.save()
    return feedback


@transaction.atomic
def withdraw_feedback(feedback: Feedback, user) -> None:
    feedback = _locked(feedback)
    ensure_author_can_change(feedback, user)
    feedback.delete()


@transaction.atomic
def change_status(feedback: Feedback, user, status: str, duplicate_of=None) -> Feedback:
    feedback = _locked(feedback)
    campaign = feedback.campaign
    ensure_unblocked(campaign)
    if policies.is_team(user, campaign):
        role = FeedbackStatusChange.Role.TEAM
        if status not in TEAM_STATUSES:
            raise FeedbackError("invalid_status")
    elif policies.is_author(user, feedback):
        role = FeedbackStatusChange.Role.AUTHOR
        if feedback.status != Feedback.Status.FIXED or status not in AUTHOR_STATUSES:
            raise FeedbackError("invalid_status")
    else:
        raise FeedbackError("not_allowed")
    if status == Feedback.Status.DUPLICATE:
        if (
            duplicate_of is None
            or duplicate_of.campaign_id != campaign.pk
            or duplicate_of.pk == feedback.pk
        ):
            raise FeedbackError("invalid_duplicate")
        feedback.duplicate_of = duplicate_of
    else:
        feedback.duplicate_of = None
    feedback.status = status
    feedback.save(update_fields=["status", "duplicate_of", "updated_at"])
    FeedbackStatusChange.objects.create(feedback=feedback, status=status, role=role, actor=user)
    if role == FeedbackStatusChange.Role.TEAM:
        _notify_author(feedback)
    return feedback


def _notify_author(feedback: Feedback) -> None:
    author = feedback.author
    if author is None or not author.email or author.deletion_scheduled_for is not None:
        return
    campaign = feedback.campaign
    context = {
        "username": author.username,
        "feedback_title": feedback.title,
        "status": Feedback.Status(feedback.status).label,
        "campaign_title": campaign.title,
        "feedback_url": (
            f"{settings.FRONTEND_URL}/p/{campaign.project.slug}/c/{campaign.slug}"
            f"/feedback/{feedback.pk}"
        ),
        "account_url": f"{settings.FRONTEND_URL}/account",
    }
    email = author.email
    transaction.on_commit(
        lambda: get_adapter().send_mail("feedback/email/status_changed", email, context)
    )


def _sync_published(feedback: Feedback, user) -> None:
    published = (
        feedback.publish_proposed_at is not None and feedback.author_consented_at is not None
    )
    if published and feedback.published_at is None:
        feedback.published_at = timezone.now()
        record(
            AuditEvent.Kind.FEEDBACK_PUBLISHED,
            actor=user,
            data={"campaign": str(feedback.campaign_id), "feedback": str(feedback.pk)},
        )
    elif not published and feedback.published_at is not None:
        feedback.published_at = None
        record(
            AuditEvent.Kind.FEEDBACK_UNPUBLISHED,
            actor=user,
            data={"campaign": str(feedback.campaign_id), "feedback": str(feedback.pk)},
        )


@transaction.atomic
def publish_action(feedback: Feedback, user, action: str) -> Feedback:
    """``propose`` (team), ``consent`` (author, after a proposal) and ``withdraw`` (either side:
    the feedback is private again and both steps start over)."""
    feedback = _locked(feedback)
    ensure_unblocked(feedback.campaign)
    if feedback.blocked_at is not None and action != "withdraw":
        raise FeedbackError("blocked")  # hidden by moderators (WP 7.1)
    team = policies.is_team(user, feedback.campaign)
    author = policies.is_author(user, feedback)
    now = timezone.now()
    if action == "propose" and team:
        feedback.publish_proposed_at = feedback.publish_proposed_at or now
    elif action == "consent" and author:
        if feedback.publish_proposed_at is None:
            raise FeedbackError("not_proposed")
        feedback.author_consented_at = feedback.author_consented_at or now
    elif action == "withdraw" and (team or author):
        feedback.publish_proposed_at = None
        feedback.author_consented_at = None
    else:
        raise FeedbackError("not_allowed")
    _sync_published(feedback, user)
    feedback.save(
        update_fields=["publish_proposed_at", "author_consented_at", "published_at", "updated_at"]
    )
    return feedback
