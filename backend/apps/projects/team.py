"""Project team: invitations, removal, leaving, ownership transfer (WP 2.3).

Decisions: maintainers join only by accepting an invitation (owner's decision). Conservative
defaults chosen in WP 2.3: only the owner invites, removes and transfers; maintainers may leave;
invitations expire after 14 days; at most 20 pending invitations per project.
"""

from datetime import timedelta

from allauth.account.adapter import get_adapter
from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record

from .models import Invitation, Membership, Project

INVITATION_LIFETIME = timedelta(days=14)
MAX_PENDING_INVITATIONS = 20


class TeamError(Exception):
    """A rule violation with a machine-readable code for the API."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def invitable_user(username: str):
    """Users that may be invited: active, confirmed email, not waiting for deletion. Anyone else
    is reported as "not found", like on public profiles."""
    user = (
        get_user_model()
        .objects.filter(
            username=username.strip().lower(), is_active=True, deletion_scheduled_for__isnull=True
        )
        .first()
    )
    if user is None or not EmailAddress.objects.filter(user=user, verified=True).exists():
        raise TeamError("user_not_found")
    return user


def pending_invitations(project: Project):
    return Invitation.objects.filter(
        project=project, status=Invitation.Status.PENDING, expires_at__gt=timezone.now()
    ).select_related("invitee", "invited_by")


@transaction.atomic
def invite(project: Project, by, username: str) -> Invitation:
    invitee = invitable_user(username)
    if Membership.objects.filter(project=project, user=invitee).exists():
        raise TeamError("already_member")
    # An expired invitation no longer blocks a new one.
    Invitation.objects.filter(
        project=project,
        invitee=invitee,
        status=Invitation.Status.PENDING,
        expires_at__lte=timezone.now(),
    ).update(status=Invitation.Status.REVOKED)
    if pending_invitations(project).filter(invitee=invitee).exists():
        raise TeamError("already_invited")
    if pending_invitations(project).count() >= MAX_PENDING_INVITATIONS:
        raise TeamError("too_many_invitations")
    invitation = Invitation.objects.create(
        project=project,
        invitee=invitee,
        invited_by=by,
        expires_at=timezone.now() + INVITATION_LIFETIME,
    )
    get_adapter().send_mail(
        "projects/email/invitation",
        invitee.email,
        {
            "username": invitee.username,
            "project_name": project.name,
            "inviter": by.username,
            "account_url": f"{settings.FRONTEND_URL}/account",
        },
    )
    return invitation


def invitation_for_invitee(user, invitation_id) -> Invitation | None:
    return (
        Invitation.objects.select_related("project")
        .filter(
            pk=invitation_id,
            invitee=user,
            status=Invitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        )
        .first()
    )


@transaction.atomic
def accept(invitation: Invitation) -> Membership:
    invitation.status = Invitation.Status.ACCEPTED
    invitation.save(update_fields=["status", "updated_at"])
    membership = Membership.objects.create(
        project=invitation.project, user=invitation.invitee, role=Membership.Role.MAINTAINER
    )
    record(
        AuditEvent.Kind.PROJECT_MEMBER_ADDED,
        actor=invitation.invitee,
        subject=invitation.invitee,
        data={"project": str(invitation.project_id)},
    )
    return membership


def decline(invitation: Invitation) -> None:
    invitation.status = Invitation.Status.DECLINED
    invitation.save(update_fields=["status", "updated_at"])


def revoke(invitation: Invitation) -> None:
    invitation.status = Invitation.Status.REVOKED
    invitation.save(update_fields=["status", "updated_at"])


@transaction.atomic
def remove_member(project: Project, by, username: str) -> None:
    """The owner removes a maintainer, or a maintainer leaves. The owner cannot leave (transfer
    the project first)."""
    membership = (
        Membership.objects.select_related("user")
        .filter(project=project, user__username=username.lower())
        .first()
    )
    if membership is None:
        raise TeamError("not_a_member")
    if membership.role == Membership.Role.OWNER:
        raise TeamError("owner_cannot_leave")
    is_self = membership.user_id == by.pk
    by_owner = Membership.objects.filter(
        project=project, user=by, role=Membership.Role.OWNER
    ).exists()
    if not (is_self or by_owner):
        raise TeamError("forbidden")
    membership.delete()
    record(
        AuditEvent.Kind.PROJECT_MEMBER_REMOVED,
        actor=by,
        subject=membership.user,
        data={"project": str(project.pk), "left": is_self},
    )


@transaction.atomic
def transfer_ownership(project: Project, owner, username: str) -> None:
    """The owner hands the project to one of its maintainers and becomes a maintainer."""
    target = (
        Membership.objects.select_related("user")
        .filter(project=project, user__username=username.lower(), role=Membership.Role.MAINTAINER)
        .first()
    )
    if target is None:
        raise TeamError("not_a_maintainer")
    current = Membership.objects.get(project=project, user=owner, role=Membership.Role.OWNER)
    current.role = Membership.Role.MAINTAINER
    current.save(update_fields=["role", "updated_at"])
    target.role = Membership.Role.OWNER
    target.save(update_fields=["role", "updated_at"])
    record(
        AuditEvent.Kind.PROJECT_OWNER_CHANGED,
        actor=owner,
        subject=target.user,
        data={"project": str(project.pk), "reason": "transfer"},
    )
