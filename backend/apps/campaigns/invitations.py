"""Invitations to private campaigns (WP 3A.5) and joining through them.

Owner's decision (2026-11-13): private campaigns take invited people only, invited by username;
nobody takes part without accepting. Defaults set in WP 3A.5 (conservative, like the project
team in WP 2.3): the whole team invites; only published, still running private campaigns;
invitations expire after 14 days; at most 100 open invitations per campaign; accepting needs a
free place (hard limit), otherwise the invitation stays open.
"""

from datetime import timedelta

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.projects.models import Membership
from apps.projects.team import TeamError, invitable_user

from .models import Campaign, CampaignInvitation, Participation
from .participation import activate
from .services import CampaignError, ensure_unblocked

INVITATION_LIFETIME = timedelta(days=14)
MAX_PENDING_INVITATIONS = 100


def pending_invitations(campaign: Campaign):
    return CampaignInvitation.objects.filter(
        campaign=campaign,
        status=CampaignInvitation.Status.PENDING,
        expires_at__gt=timezone.now(),
    ).select_related("invitee", "invited_by")


def _invitee(username: str):
    try:
        return invitable_user(username)
    except TeamError:
        raise CampaignError("user_not_found") from None


@transaction.atomic
def invite(campaign: Campaign, by, username: str) -> CampaignInvitation:
    ensure_unblocked(campaign)
    if campaign.visibility != Campaign.Visibility.PRIVATE:
        raise CampaignError("not_private")
    if campaign.state != Campaign.State.PUBLISHED:
        raise CampaignError("not_published")
    invitee = _invitee(username)
    if Membership.objects.filter(project=campaign.project, user=invitee).exists():
        raise CampaignError("already_team")
    previous = Participation.objects.filter(campaign=campaign, user=invitee).first()
    if previous is not None and previous.status == Participation.Status.ACTIVE:
        raise CampaignError("already_participant")
    if previous is not None and previous.status == Participation.Status.REMOVED:
        raise CampaignError("removed")
    # An expired invitation no longer blocks a new one.
    CampaignInvitation.objects.filter(
        campaign=campaign,
        invitee=invitee,
        status=CampaignInvitation.Status.PENDING,
        expires_at__lte=timezone.now(),
    ).update(status=CampaignInvitation.Status.REVOKED)
    if pending_invitations(campaign).filter(invitee=invitee).exists():
        raise CampaignError("already_invited")
    if pending_invitations(campaign).count() >= MAX_PENDING_INVITATIONS:
        raise CampaignError("too_many_invitations")
    invitation = CampaignInvitation.objects.create(
        campaign=campaign,
        invitee=invitee,
        invited_by=by,
        expires_at=timezone.now() + INVITATION_LIFETIME,
    )
    context = {
        "username": invitee.username,
        "campaign_title": campaign.title,
        "project_name": campaign.project.name,
        "inviter": by.username,
        "account_url": f"{settings.FRONTEND_URL}/account",
    }
    transaction.on_commit(
        lambda: get_adapter().send_mail("campaigns/email/invitation", invitee.email, context)
    )
    return invitation


def invitation_for_invitee(user, invitation_id) -> CampaignInvitation | None:
    return (
        CampaignInvitation.objects.select_related("campaign__project")
        .filter(
            pk=invitation_id,
            invitee=user,
            status=CampaignInvitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        )
        .first()
    )


def open_invitations_of(user):
    return (
        CampaignInvitation.objects.filter(
            invitee=user,
            status=CampaignInvitation.Status.PENDING,
            expires_at__gt=timezone.now(),
            campaign__state=Campaign.State.PUBLISHED,
            campaign__blocked_at__isnull=True,
            campaign__project__blocked_at__isnull=True,
        )
        .select_related("campaign__project", "invited_by")
        .order_by("-created_at")
    )


@transaction.atomic
def accept(invitation: CampaignInvitation) -> Participation:
    """Joins through the invitation (shared rules and row lock in participation.activate)."""
    participation = activate(invitation.campaign_id, invitation.invitee, via="invitation")
    invitation.status = CampaignInvitation.Status.ACCEPTED
    invitation.save(update_fields=["status", "updated_at"])
    return participation


def decline(invitation: CampaignInvitation) -> None:
    invitation.status = CampaignInvitation.Status.DECLINED
    invitation.save(update_fields=["status", "updated_at"])


def revoke(invitation: CampaignInvitation) -> None:
    invitation.status = CampaignInvitation.Status.REVOKED
    invitation.save(update_fields=["status", "updated_at"])


def participations_of(user):
    return (
        Participation.objects.filter(
            user=user,
            status=Participation.Status.ACTIVE,
            campaign__blocked_at__isnull=True,
            campaign__project__blocked_at__isnull=True,
        )
        .select_related("campaign__project")
        .order_by("-created_at")
    )
