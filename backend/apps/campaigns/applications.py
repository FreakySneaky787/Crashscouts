"""Applications to campaigns with approval (WP 3A.4b).

Owner's decisions (2026-11-13): per-campaign questions; answers visible to the team only and
deleted on rejection, withdrawal, leaving or removal at once, otherwise 30 days after the campaign
is completed or cancelled; when the campaign is full, open applications stay open and can be
approved only once a place is free, new applications are not possible, withdrawing always is; no
email to the team per application, applicants get an email on approval and rejection.
Rejected applicants cannot apply again to the same campaign (owner's decision of phase 3A).
"""

from datetime import timedelta

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.projects.models import Membership
from apps.projects.services import has_confirmed_email

from . import status
from .models import Application, ApplicationAnswer, ApplicationQuestion, Campaign, Participation
from .participation import activate
from .services import CampaignError

ANSWER_RETENTION = timedelta(days=30)
YES_NO = ("yes", "no")


def _check_answers(campaign: Campaign, answers: dict) -> list[tuple[ApplicationQuestion, str]]:
    """Validates the answers against the campaign's questions; returns them in order."""
    if not isinstance(answers, dict):
        raise CampaignError("invalid_answers")
    questions = list(ApplicationQuestion.objects.filter(campaign=campaign))
    known = {str(q.pk) for q in questions}
    if any(str(key) not in known for key in answers):
        raise CampaignError("invalid_answers")
    result = []
    for question in questions:
        raw = answers.get(str(question.pk), "")
        value = raw.strip() if isinstance(raw, str) else None
        if value is None or len(value) > ApplicationAnswer.MAX_LENGTH:
            raise CampaignError("invalid_answers")
        if not value:
            if question.required:
                raise CampaignError("answer_required")
            continue
        if question.kind == ApplicationQuestion.Kind.SHORT_TEXT and len(value) > 200:
            raise CampaignError("invalid_answers")
        if (
            question.kind == ApplicationQuestion.Kind.SINGLE_CHOICE
            and value not in question.options
        ):
            raise CampaignError("invalid_answers")
        if question.kind == ApplicationQuestion.Kind.YES_NO and value not in YES_NO:
            raise CampaignError("invalid_answers")
        result.append((question, value))
    return result


def _active_count(campaign: Campaign) -> int:
    return Participation.objects.filter(
        campaign=campaign, status=Participation.Status.ACTIVE
    ).count()


@transaction.atomic
def apply(campaign: Campaign, user, answers: dict) -> Application:
    campaign = Campaign.objects.select_for_update().get(pk=campaign.pk)
    if (
        campaign.visibility != Campaign.Visibility.PUBLIC
        or campaign.participation != Campaign.Participation.APPROVAL
    ):
        raise CampaignError("no_applications")
    if not status.accepts_participants(
        campaign.state, participants=_active_count(campaign), target=campaign.target_testers
    ):
        raise CampaignError(
            "campaign_full" if campaign.state == Campaign.State.PUBLISHED else "campaign_closed"
        )
    if Membership.objects.filter(project=campaign.project, user=user).exists():
        raise CampaignError("team_member")
    if not has_confirmed_email(user):
        raise CampaignError("email_unconfirmed")
    participation = Participation.objects.filter(campaign=campaign, user=user).first()
    if participation is not None and participation.status == Participation.Status.REMOVED:
        raise CampaignError("removed")
    if participation is not None and participation.status == Participation.Status.ACTIVE:
        raise CampaignError("already_participant")
    existing = Application.objects.filter(campaign=campaign, applicant=user).first()
    if existing is not None and existing.status == Application.Status.REJECTED:
        raise CampaignError("rejected")
    if existing is not None and existing.status == Application.Status.PENDING:
        raise CampaignError("already_applied")
    checked = _check_answers(campaign, answers)
    if existing is None:
        application = Application.objects.create(campaign=campaign, applicant=user)
    else:  # withdrawn earlier, or approved and left since: a fresh application
        application = existing
        application.status = Application.Status.PENDING
        application.decided_by = None
        application.decided_at = None
        application.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
        application.answers.all().delete()
    ApplicationAnswer.objects.bulk_create(
        ApplicationAnswer(
            application=application,
            question=question,
            prompt=question.prompt,
            value=value,
            position=index,
        )
        for index, (question, value) in enumerate(checked)
    )
    return application


@transaction.atomic
def withdraw(campaign: Campaign, user) -> None:
    application = (
        Application.objects.select_for_update()
        .filter(campaign=campaign, applicant=user, status=Application.Status.PENDING)
        .first()
    )
    if application is None:
        raise CampaignError("no_open_application")
    application.status = Application.Status.WITHDRAWN
    application.save(update_fields=["status", "updated_at"])
    application.answers.all().delete()


def _notify(application: Application, template: str) -> None:
    user = application.applicant
    if not user.email:
        return
    context = {
        "username": user.username,
        "campaign_title": application.campaign.title,
        "project_name": application.campaign.project.name,
        "campaign_url": (
            f"{settings.FRONTEND_URL}/p/{application.campaign.project.slug}"
            f"/c/{application.campaign.slug}"
        ),
        "account_url": f"{settings.FRONTEND_URL}/account",
    }
    transaction.on_commit(lambda: get_adapter().send_mail(template, user.email, context))


def _pending(campaign: Campaign, application_id) -> Application:
    application = (
        Application.objects.select_for_update()
        .select_related("applicant", "campaign__project")
        .filter(campaign=campaign, pk=application_id, status=Application.Status.PENDING)
        .first()
    )
    if application is None:
        raise CampaignError("no_open_application")
    return application


@transaction.atomic
def approve(campaign: Campaign, by, application_id) -> Participation:
    """Approval needs a free place (same row lock and limit as every other way in)."""
    application = _pending(campaign, application_id)
    participation = activate(campaign.pk, application.applicant, via="application")
    application.status = Application.Status.APPROVED
    application.decided_by, application.decided_at = by, timezone.now()
    application.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
    record(
        AuditEvent.Kind.CAMPAIGN_APPLICATION_APPROVED,
        actor=by,
        subject=application.applicant,
        data={"campaign": str(campaign.pk)},
    )
    _notify(application, "campaigns/email/application_approved")
    return participation


@transaction.atomic
def reject(campaign: Campaign, by, application_id) -> None:
    application = _pending(campaign, application_id)
    application.status = Application.Status.REJECTED
    application.decided_by, application.decided_at = by, timezone.now()
    application.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
    application.answers.all().delete()  # data minimisation: answers go at once
    record(
        AuditEvent.Kind.CAMPAIGN_APPLICATION_REJECTED,
        actor=by,
        subject=application.applicant,
        data={"campaign": str(campaign.pk)},
    )
    _notify(application, "campaigns/email/application_rejected")


def purge_answers(now=None) -> int:
    """Deletes the answers of campaigns that ended more than 30 days ago. Returns the count."""
    cutoff = (now or timezone.now()) - ANSWER_RETENTION
    ended = Q(application__campaign__completed_at__lt=cutoff) | Q(
        application__campaign__cancelled_at__lt=cutoff
    )
    deleted, _ = ApplicationAnswer.objects.filter(ended).delete()
    return deleted


def open_applications_count(campaign: Campaign) -> int:
    return Application.objects.filter(campaign=campaign, status=Application.Status.PENDING).count()
