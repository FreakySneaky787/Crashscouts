"""Account suspensions (WP 7.2, ADR 0027).

A suspended account is read only: the write guard (``middleware.SuspensionGuard``) refuses every
writing request except signing out, the data export, deleting the account, the appeal, and
changing the password or two-factor methods. The suspension ends on its own at ``ends_at``
(compared with the clock; no background job), when a moderator lifts it, or when an appeal is
accepted. Any moderator suspends and decides appeals (owner's decision 2026-11-14); every step is
in the audit log and admins see all suspensions in one list.
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.roles import NONE
from apps.audit.models import AuditEvent
from apps.audit.services import record

from .actions import ModerationError, _close_reports, _mail_user, open_reports
from .models import AccountSuspension, Report
from .services import USER_REASONS


def active_q(now=None) -> Q:
    now = now or timezone.now()
    return Q(lifted_at__isnull=True) & (Q(ends_at__isnull=True) | Q(ends_at__gt=now))


def active_suspension(user) -> AccountSuspension | None:
    if getattr(user, "pk", None) is None:
        return None  # anonymous visitors
    return AccountSuspension.objects.filter(active_q(), user=user).first()


def is_suspended(user) -> bool:
    return active_suspension(user) is not None


def _audit(kind, by, suspension: AccountSuspension, **data) -> None:
    record(
        kind,
        actor=by,
        subject=suspension.user,
        data={"suspension": str(suspension.pk), **data},
    )


def _ends_label(suspension: AccountSuspension) -> str:
    if suspension.ends_at is None:
        return "permanently"
    return f"until {suspension.ends_at:%Y-%m-%d %H:%M} UTC"


@transaction.atomic
def suspend(user, by, category: str, message: str, ends_at) -> AccountSuspension:
    """Suspends ``user`` until ``ends_at`` (``None`` = permanently); closes open reports."""
    from django.contrib.auth import get_user_model

    if category not in USER_REASONS:
        raise ModerationError("invalid_category")
    if not message.strip():
        raise ModerationError("message_required")
    if ends_at is not None and ends_at <= timezone.now():
        raise ModerationError("end_in_past")
    user = get_user_model().objects.select_for_update().get(pk=user.pk)
    if user.pk == getattr(by, "pk", None):
        raise ModerationError("not_yourself")
    if user.platform_role != NONE:
        raise ModerationError("has_role")  # an admin removes the role first
    if is_suspended(user):
        raise ModerationError("already_suspended")
    suspension = AccountSuspension.objects.create(
        user=user, category=category, message=message.strip(), ends_at=ends_at, created_by=by
    )
    _close_reports(open_reports(user), Report.Status.RESOLVED)
    _audit(
        AuditEvent.Kind.ACCOUNT_SUSPENDED,
        by,
        suspension,
        category=category,
        permanent=ends_at is None,
    )
    _mail_user(
        user,
        "moderation/email/suspended",
        {"message": suspension.message, "until": _ends_label(suspension)},
    )
    return suspension


@transaction.atomic
def lift(suspension: AccountSuspension, by, *, via_appeal: bool = False) -> None:
    suspension = AccountSuspension.objects.select_for_update().get(pk=suspension.pk)
    if not AccountSuspension.objects.filter(active_q(), pk=suspension.pk).exists():
        raise ModerationError("not_suspended")
    suspension.lifted_at = timezone.now()
    suspension.lifted_by = by
    suspension.save(update_fields=["lifted_at", "lifted_by", "updated_at"])
    _audit(AuditEvent.Kind.ACCOUNT_SUSPENSION_LIFTED, by, suspension, via_appeal=via_appeal)
    if not via_appeal:
        _mail_user(suspension.user, "moderation/email/suspension_lifted", {})


@transaction.atomic
def appeal(suspension: AccountSuspension, by, text: str) -> AccountSuspension:
    """One appeal per suspension, by the suspended person, while it is in force."""
    suspension = AccountSuspension.objects.select_for_update().get(pk=suspension.pk)
    if suspension.user_id != getattr(by, "pk", None):
        raise ModerationError("not_suspended")
    if not AccountSuspension.objects.filter(active_q(), pk=suspension.pk).exists():
        raise ModerationError("not_suspended")
    if suspension.appealed_at is not None:
        raise ModerationError("already_appealed")
    if not text.strip():
        raise ModerationError("message_required")
    suspension.appeal_text = text.strip()
    suspension.appealed_at = timezone.now()
    suspension.save(update_fields=["appeal_text", "appealed_at", "updated_at"])
    _audit(AuditEvent.Kind.ACCOUNT_SUSPENSION_APPEALED, by, suspension)
    return suspension


@transaction.atomic
def decide_appeal(suspension: AccountSuspension, by, decision: str) -> None:
    """Any moderator decides, also the one who suspended (owner's decision 2026-11-14)."""
    suspension = AccountSuspension.objects.select_for_update().get(pk=suspension.pk)
    if suspension.appealed_at is None or suspension.appeal_decision:
        raise ModerationError("no_open_appeal")
    if decision not in AccountSuspension.Decision.values:
        raise ModerationError("invalid_decision")
    suspension.appeal_decision = decision
    suspension.appeal_decided_at = timezone.now()
    suspension.appeal_decided_by = by
    suspension.save(
        update_fields=["appeal_decision", "appeal_decided_at", "appeal_decided_by", "updated_at"]
    )
    lifted = decision == AccountSuspension.Decision.LIFTED
    if lifted and AccountSuspension.objects.filter(active_q(), pk=suspension.pk).exists():
        lift(suspension, by, via_appeal=True)
    _audit(AuditEvent.Kind.ACCOUNT_SUSPENSION_APPEAL_DECIDED, by, suspension, decision=decision)
    _mail_user(suspension.user, "moderation/email/suspension_appeal_decided", {"lifted": lifted})


def info(suspension: AccountSuspension | None) -> dict | None:
    """What the suspended person sees: reason, message, end, appeal state."""
    if suspension is None:
        return None
    return {
        "id": str(suspension.pk),
        "category": suspension.category,
        "message": suspension.message,
        "created_at": suspension.created_at.isoformat(),
        "ends_at": suspension.ends_at.isoformat() if suspension.ends_at else None,
        "appeal": (
            "none" if suspension.appealed_at is None else (suspension.appeal_decision or "pending")
        ),
    }


def describe(suspension: AccountSuspension) -> dict:
    """What moderators and admins see (with who acted)."""
    name = lambda u: u.username if u else None  # noqa: E731
    now = timezone.now()
    active = suspension.lifted_at is None and (
        suspension.ends_at is None or suspension.ends_at > now
    )
    return {
        **info(suspension),
        "user_id": str(suspension.user_id),
        "username": suspension.user.username,
        "active": active,
        "created_by": name(suspension.created_by),
        "lifted_at": suspension.lifted_at.isoformat() if suspension.lifted_at else None,
        "lifted_by": name(suspension.lifted_by),
        "appeal_text": suspension.appeal_text,
        "appealed_at": suspension.appealed_at.isoformat() if suspension.appealed_at else None,
        "appeal_decided_by": name(suspension.appeal_decided_by),
    }
