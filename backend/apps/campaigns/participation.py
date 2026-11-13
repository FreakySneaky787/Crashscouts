"""Taking part in campaigns (WP 3A.4a): joining, leaving, removal by the team.

Decisions: the desired number of testers is a hard limit (C); testers may leave, the team may
remove participants (2026-11-13). Defaults set in WP 3A.4a: joining directly needs a public
campaign with direct participation and a confirmed email address; team members do not join their
own campaigns; removed people can neither join, be invited nor accept an invitation again.
"""

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.db import transaction

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.projects.models import Membership
from apps.projects.services import has_confirmed_email

from . import status
from .models import ApplicationAnswer, Campaign, CampaignInvitation, Participation
from .services import CampaignError


def activate(campaign_id, user, *, via: str) -> Participation:
    """Makes ``user`` an active participant. Must run inside a transaction: the campaign row is
    locked first, so concurrent joins can never exceed the limit."""
    campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
    existing = Participation.objects.filter(campaign=campaign, user=user).first()
    if existing is not None and existing.status == Participation.Status.REMOVED:
        raise CampaignError("removed")
    if existing is not None and existing.status == Participation.Status.ACTIVE:
        raise CampaignError("already_participant")
    active = Participation.objects.filter(campaign=campaign, status=Participation.Status.ACTIVE)
    if not status.accepts_participants(
        campaign.state, participants=active.count(), target=campaign.target_testers
    ):
        raise CampaignError(
            "campaign_full" if campaign.state == Campaign.State.PUBLISHED else "campaign_closed"
        )
    if existing is None:
        participation = Participation.objects.create(campaign=campaign, user=user)
    else:
        participation = existing
        participation.status = Participation.Status.ACTIVE
        participation.save(update_fields=["status", "updated_at"])
    record(
        AuditEvent.Kind.CAMPAIGN_PARTICIPANT_JOINED,
        actor=user,
        subject=user,
        data={"campaign": str(campaign.pk), "via": via},
    )
    return participation


def _delete_answers(campaign: Campaign, user) -> None:
    """Application answers are not kept once someone no longer takes part (owner's decision)."""
    ApplicationAnswer.objects.filter(
        application__campaign=campaign, application__applicant=user
    ).delete()


@transaction.atomic
def join(campaign: Campaign, user) -> Participation:
    """Join directly (public campaigns with direct participation)."""
    if (
        campaign.visibility != Campaign.Visibility.PUBLIC
        or campaign.participation != Campaign.Participation.DIRECT
    ):
        raise CampaignError("not_direct")
    if Membership.objects.filter(project=campaign.project, user=user).exists():
        raise CampaignError("team_member")
    if not has_confirmed_email(user):
        raise CampaignError("email_unconfirmed")
    return activate(campaign.pk, user, via="direct")


@transaction.atomic
def leave(campaign: Campaign, user) -> None:
    participation = (
        Participation.objects.select_for_update()
        .filter(campaign=campaign, user=user, status=Participation.Status.ACTIVE)
        .first()
    )
    if participation is None:
        raise CampaignError("not_participant")
    participation.status = Participation.Status.LEFT
    participation.save(update_fields=["status", "updated_at"])
    _delete_answers(campaign, user)
    record(
        AuditEvent.Kind.CAMPAIGN_PARTICIPANT_LEFT,
        actor=user,
        subject=user,
        data={"campaign": str(campaign.pk)},
    )


@transaction.atomic
def remove(campaign: Campaign, by, username: str) -> None:
    """The team removes a participant; they cannot come back to this campaign."""
    participation = (
        Participation.objects.select_for_update()
        .select_related("user")
        .filter(
            campaign=campaign,
            user__username=username.strip().lower(),
            status=Participation.Status.ACTIVE,
        )
        .first()
    )
    if participation is None:
        raise CampaignError("not_participant")
    participation.status = Participation.Status.REMOVED
    participation.save(update_fields=["status", "updated_at"])
    _delete_answers(campaign, participation.user)
    CampaignInvitation.objects.filter(
        campaign=campaign, invitee=participation.user, status=CampaignInvitation.Status.PENDING
    ).update(status=CampaignInvitation.Status.REVOKED)
    record(
        AuditEvent.Kind.CAMPAIGN_PARTICIPANT_REMOVED,
        actor=by,
        subject=participation.user,
        data={"campaign": str(campaign.pk)},
    )
    user = participation.user
    if user.email:
        context = {
            "username": user.username,
            "campaign_title": campaign.title,
            "project_name": campaign.project.name,
            "account_url": f"{settings.FRONTEND_URL}/account",
        }
        transaction.on_commit(
            lambda: get_adapter().send_mail("campaigns/email/removed", user.email, context)
        )
