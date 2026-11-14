"""Purpose-bound moderator access to reported content (WP 7.3, ADR 0028).

Master prompt 3.10: private content is not open to all moderators. Without an access a moderator
sees the reports and the title of the reported object only. An access is opened for one object,
by the moderator who took the case, with a reason; it is valid for 24 hours and shows a read-only
copy of the content in the moderation area (download links as text, never opened; files by name
only). Every grant and every view is audited; admins see all accesses; the team is not notified
(owner's decision 2026-11-14).
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.campaigns.models import Campaign
from apps.feedback.models import Feedback
from apps.projects.models import Project

from .actions import ModerationError, _type_of, open_reports
from .models import ModeratorAccess
from .services import _label

KINDS = {
    Project: ModeratorAccess.TargetType.PROJECT,
    Campaign: ModeratorAccess.TargetType.CAMPAIGN,
    Feedback: ModeratorAccess.TargetType.FEEDBACK,
}


def _kind(target) -> str:
    kind = KINDS.get(type(target))
    if kind is None:
        raise ModerationError("not_supported")  # people and links show everything already
    return kind


def _audit(kind, by, access: ModeratorAccess) -> None:
    record(
        kind,
        actor=by,
        data={
            "access": str(access.pk),
            "target_type": access.target_type,
            "target": str(getattr(access, access.target_type + "_id")),
        },
    )


def current_access(target, moderator) -> ModeratorAccess | None:
    kind = KINDS.get(type(target))
    if kind is None:
        return None
    return ModeratorAccess.objects.filter(
        moderator=moderator, target_type=kind, expires_at__gt=timezone.now(), **{kind: target}
    ).first()


@transaction.atomic
def grant(target, by, reason: str) -> ModeratorAccess:
    kind = _kind(target)
    reason = reason.strip()
    if not reason:
        raise ModerationError("reason_required")
    if len(reason) > ModeratorAccess.REASON_MAX_LENGTH:
        raise ModerationError("too_long")
    if not open_reports(target).filter(taken_by=by).exists():
        raise ModerationError("take_first")  # only for an open case this moderator took
    existing = current_access(target, by)
    if existing is not None:
        return existing
    access = ModeratorAccess.objects.create(
        moderator=by,
        target_type=kind,
        target_label=_label(target)[:300],
        reason=reason,
        expires_at=timezone.now() + timedelta(hours=ModeratorAccess.HOURS),
        **{kind: target},
    )
    _audit(AuditEvent.Kind.MODERATOR_ACCESS_GRANTED, by, access)
    return access


def _project(project: Project) -> dict:
    return {
        "name": project.name,
        "slug": project.slug,
        "visibility": project.visibility,
        "summary": project.summary,
        "description": project.description,
        "repository_url": project.repository_url,
        "campaigns": [c.title for c in project.campaigns.all()],
    }


def _campaign(campaign: Campaign) -> dict:
    return {
        "title": campaign.title,
        "project": campaign.project.name,
        "visibility": campaign.visibility,
        "state": campaign.state,
        "summary": campaign.summary,
        "description": campaign.description,
        "version": campaign.version,
        "changelog": campaign.changelog,
        "prerequisites": campaign.prerequisites,
        # As text only: the moderation area never opens download links.
        "links": [{"label": link.label, "url": link.url} for link in campaign.links.all()],
    }


def _feedback(feedback: Feedback) -> dict:
    return {
        "title": feedback.title,
        "campaign": feedback.campaign.title,
        "kind": feedback.kind,
        "status": feedback.status,
        "published": feedback.published_at is not None,
        **{
            field: getattr(feedback, field)
            for field in (
                "description",
                "steps",
                "expected",
                "actual",
                "suggestion",
                "solution",
                "environment",
                "location",
            )
        },
        # File names only, never the files themselves.
        "attachments": [a.name for a in feedback.attachments.all()],
    }


@transaction.atomic
def view(access_id, by) -> dict | None:
    """The content behind an access of ``by`` that is still valid; None otherwise (404)."""
    access = (
        ModeratorAccess.objects.select_for_update()
        .filter(pk=access_id, moderator=by, expires_at__gt=timezone.now())
        .first()
    )
    if access is None:
        return None
    target = getattr(access, access.target_type)
    if target is None:
        return None  # deleted meanwhile
    content = {"project": _project, "campaign": _campaign, "feedback": _feedback}[
        access.target_type
    ](target)
    access.views += 1
    access.save(update_fields=["views", "updated_at"])
    _audit(AuditEvent.Kind.MODERATOR_ACCESS_USED, by, access)
    return {
        **describe(access),
        "target_id": str(target.pk),
        "case_type": _type_of(target),
        "content": content,
    }


def describe(access: ModeratorAccess) -> dict:
    return {
        "id": str(access.pk),
        "moderator": access.moderator.username if access.moderator else None,
        "target_type": access.target_type,
        "target_label": access.target_label,
        "reason": access.reason,
        "created_at": access.created_at.isoformat(),
        "expires_at": access.expires_at.isoformat(),
        "active": access.expires_at > timezone.now(),
        "views": access.views,
    }
