"""Platform roles (WP 3B.1, ADR 0018): the only place that decides who is admin or moderator.

A role counts only while the account is active, not scheduled for deletion, and has two-factor
authentication turned on. Django's ``is_staff`` (Django admin over an SSH tunnel) is unrelated.
"""

from allauth.account.models import EmailAddress
from allauth.mfa.utils import is_mfa_enabled
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.audit.models import AuditEvent
from apps.audit.services import record

ADMIN = "admin"
MODERATOR = "moderator"
NONE = ""
ROLES = (ADMIN, MODERATOR, NONE)


class RoleError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def effective_role(user) -> str:
    if not getattr(user, "is_authenticated", False) or not user.platform_role:
        return NONE
    if not user.is_active or user.deletion_scheduled_for is not None:
        return NONE
    if not is_mfa_enabled(user):
        return NONE  # a role without 2FA has no effect
    return user.platform_role


def is_admin(user) -> bool:
    return effective_role(user) == ADMIN


def is_moderator(user) -> bool:
    """Admins are moderators as well."""
    return effective_role(user) in {ADMIN, MODERATOR}


def _admins():
    return get_user_model().objects.filter(platform_role=ADMIN, is_active=True)


@transaction.atomic
def set_role(target_username: str, role: str, *, by=None) -> tuple[str, str]:
    """Sets the role. ``by`` is the acting admin (None for the server command).
    Returns (old role, new role)."""
    if role not in ROLES:
        raise RoleError("invalid_role")
    User = get_user_model()
    target = (
        User.objects.select_for_update()
        .filter(username=target_username.strip().lower(), is_active=True)
        .first()
    )
    if target is None or target.deletion_scheduled_for is not None:
        raise RoleError("user_not_found")
    if role and not EmailAddress.objects.filter(user=target, verified=True).exists():
        raise RoleError("user_not_found")
    if role and not is_mfa_enabled(target):
        raise RoleError("target_needs_2fa")
    old = target.platform_role
    if old == ADMIN and role != ADMIN:
        # Lock all admins so two concurrent demotions cannot remove the last one.
        remaining = _admins().select_for_update().exclude(pk=target.pk).count()
        if remaining == 0:
            raise RoleError("last_admin")
    if old == role:
        return old, role
    target.platform_role = role
    target.save(update_fields=["platform_role"])
    record(
        AuditEvent.Kind.PLATFORM_ROLE_CHANGED,
        actor=by,
        subject=target,
        data={
            "from": old or "none",
            "to": role or "none",
            "via": "admin_page" if by else "command",
        },
    )
    return old, role
