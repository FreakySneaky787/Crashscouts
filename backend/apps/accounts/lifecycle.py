"""Account deletion with a grace period and personal data export (WP 1.5).

Owner's decision: deletion makes the account invisible at once; signing in within 14 days
cancels it; afterwards the account and its personal data are deleted for good. Feedback (phase 5)
must then be anonymised, not deleted.
"""

from datetime import timedelta

from allauth.account.adapter import get_adapter
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.profiles.avatars import delete_avatar
from apps.profiles.models import Profile
from apps.projects.models import Membership
from apps.projects.services import hand_over_or_delete_owned_projects, owned_projects

GRACE_PERIOD = timedelta(days=14)


def _mail(template: str, user, **context) -> None:
    if user.email:
        get_adapter().send_mail(
            f"account/email/{template}", user.email, {"username": user.username, **context}
        )


def end_all_sessions(user) -> int:
    """Signs the user out on every device. Sessions are scanned because Django keeps no index
    from users to sessions; acceptable at the current scale (see docs/STATUS.md)."""
    ended = 0
    for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if session.get_decoded().get("_auth_user_id") == str(user.pk):
            session.delete()
            ended += 1
    return ended


def request_deletion(user) -> None:
    deletion_date = timezone.now() + GRACE_PERIOD
    user.deletion_scheduled_for = deletion_date
    user.save(update_fields=["deletion_scheduled_for"])
    end_all_sessions(user)
    record(AuditEvent.Kind.DELETION_REQUESTED, actor=user, subject=user)
    _mail(
        "deletion_scheduled",
        user,
        deletion_date=f"{deletion_date:%Y-%m-%d %H:%M}",
        owned_projects=[p.name for p in owned_projects(user)],
    )


def cancel_deletion(user) -> bool:
    """Called on every login; cancels a pending deletion. Returns True if one was cancelled."""
    if user.deletion_scheduled_for is None:
        return False
    user.deletion_scheduled_for = None
    user.save(update_fields=["deletion_scheduled_for"])
    record(AuditEvent.Kind.DELETION_CANCELLED, actor=user, subject=user)
    _mail("deletion_cancelled", user)
    return True


def purge_due_accounts(now=None) -> int:
    """Deletes accounts whose grace period has ended. Returns the number of deleted accounts."""
    now = now or timezone.now()
    deleted = 0
    for user in get_user_model().objects.filter(deletion_scheduled_for__lte=now):
        profile = Profile.objects.filter(user=user).first()
        avatar_key = profile.avatar_key if profile else None
        _mail("account_deleted", user)
        with transaction.atomic():
            # Projects go to their longest-serving maintainer, or are deleted without one.
            hand_over_or_delete_owned_projects(user)
            user.delete()  # cascades: profile, email addresses, 2FA, GitHub links
            # The event keeps no reference to the person.
            record(AuditEvent.Kind.ACCOUNT_DELETED)
        delete_avatar(avatar_key)
        deleted += 1
    return deleted


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def export_data(user) -> dict:
    """Everything stored about the user, in a portable JSON structure (GDPR art. 15 and 20)."""
    profile = (
        Profile.objects.filter(user=user)
        .prefetch_related("interests", "platforms", "skills")
        .first()
    )
    record(AuditEvent.Kind.DATA_EXPORTED, actor=user, subject=user)
    return {
        "format": "personal-data/1",
        "exported_at": timezone.now().isoformat(),
        "account": {
            "id": str(user.pk),
            "username": user.username,
            "email": user.email,
            "date_joined": _iso(user.date_joined),
            "last_login": _iso(user.last_login),
            "age_confirmed_at": _iso(user.age_confirmed_at),
            "deletion_scheduled_for": _iso(user.deletion_scheduled_for),
            "has_password": user.has_usable_password(),
        },
        "email_addresses": [
            {"email": a.email, "verified": a.verified, "primary": a.primary}
            for a in EmailAddress.objects.filter(user=user)
        ],
        "profile": None
        if profile is None
        else {
            "bio": profile.bio,
            "link": profile.link,
            "interests": [c.slug for c in profile.interests.all()],
            "platforms": [p.slug for p in profile.platforms.all()],
            "skills": [s.slug for s in profile.skills.all()],
            "visibility": {
                "bio": profile.show_bio,
                "link": profile.show_link,
                "interests": profile.show_interests,
                "platforms": profile.show_platforms,
                "skills": profile.show_skills,
                "search_engines": profile.indexable,
            },
            "has_avatar": profile.avatar_key is not None,
        },
        "projects": [
            {"slug": m.project.slug, "name": m.project.name, "role": m.role}
            for m in Membership.objects.filter(user=user).select_related("project")
        ],
        "connected_accounts": [
            {"provider": a.provider, "uid": a.uid, "date_joined": _iso(a.date_joined)}
            for a in SocialAccount.objects.filter(user=user)
        ],
        # Types and dates only: secrets, keys and recovery codes are never exported.
        "two_factor_methods": [
            {"type": a.type, "created_at": _iso(a.created_at), "last_used_at": _iso(a.last_used_at)}
            for a in Authenticator.objects.filter(user=user)
        ],
        "security_log": [
            {"event": e.kind, "at": _iso(e.created_at)}
            for e in AuditEvent.objects.filter(subject=user).order_by("created_at")
        ],
    }
