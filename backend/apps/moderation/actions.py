"""Moderation actions (WP 3B.3, ADR 0020).

Owner's decisions (2026-11-13): the team keeps seeing blocked content with the reason but cannot
change it; one appeal per block, decided by moderators; a warning emails the team and leaves a
note only moderators see; reporters get a short email without details when their report closes.
"""

from allauth.account.adapter import get_adapter
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.campaigns.models import Campaign, CampaignLink
from apps.projects.models import Membership, Project

from .models import OPEN_STATES, Block, ModerationNote, Report

TARGET_MODELS = {
    Report.TargetType.PROJECT: Project,
    Report.TargetType.CAMPAIGN: Campaign,
    Report.TargetType.LINK: CampaignLink,
}


class ModerationError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def get_target(target_type: str, target_id):
    model = TARGET_MODELS.get(target_type)
    if model is None:
        return None
    return model.objects.filter(pk=target_id).first()


def owning_project(target) -> Project:
    if isinstance(target, Project):
        return target
    if isinstance(target, Campaign):
        return target.project
    return target.campaign.project


def _type_of(target) -> str:
    if isinstance(target, Project):
        return Report.TargetType.PROJECT
    if isinstance(target, Campaign):
        return Report.TargetType.CAMPAIGN
    return Report.TargetType.LINK


def open_reports(target):
    return Report.objects.filter(
        target_type=_type_of(target), status__in=OPEN_STATES, **{_type_of(target): target}
    )


def _describe(target) -> str:
    if isinstance(target, Project):
        return f'the project "{target.name}"'
    if isinstance(target, Campaign):
        return f'the campaign "{target.title}"'
    return f'the download link "{target.label}" of the campaign "{target.campaign.title}"'


def _mail_team(project: Project, template: str, context: dict) -> None:
    for member in Membership.objects.filter(project=project).select_related("user"):
        email = member.user.email
        if not email:
            continue
        ctx = {
            "username": member.user.username,
            "project_name": project.name,
            "project_url": f"{settings.FRONTEND_URL}/p/{project.slug}",
            **context,
        }
        transaction.on_commit(
            lambda email=email, ctx=ctx: get_adapter().send_mail(template, email, ctx)
        )


def _close_reports(reports, outcome: str) -> None:
    """Closes the reports and sends each reporter a short email without details."""
    now = timezone.now()
    for found in reports.select_related("reporter"):
        found.status = outcome
        found.closed_at = now
        found.save(update_fields=["status", "closed_at", "updated_at"])
        reporter = found.reporter
        if reporter is None or not reporter.email:
            continue
        ctx = {
            "username": reporter.username,
            "target_label": found.target_label,
            "outcome": outcome,
            "account_url": f"{settings.FRONTEND_URL}/account",
        }
        email = reporter.email
        transaction.on_commit(
            lambda email=email, ctx=ctx: get_adapter().send_mail(
                "moderation/email/report_closed", email, ctx
            )
        )


def _audit(kind, by, target, **data) -> None:
    record(kind, actor=by, data={"target_type": _type_of(target), "target": str(target.pk), **data})


@transaction.atomic
def take_case(target, by) -> int:
    """Marks the open reports as being reviewed. Returns how many."""
    return (
        open_reports(target)
        .filter(status=Report.Status.OPEN)
        .update(status=Report.Status.IN_REVIEW)
    )


def active_block(target) -> Block | None:
    return Block.objects.filter(
        target_type=_type_of(target), lifted_at__isnull=True, **{_type_of(target): target}
    ).first()


@transaction.atomic
def block(target, by, category: str, message: str) -> Block:
    if category not in Report.Reason.values:
        raise ModerationError("invalid_category")
    if not message.strip():
        raise ModerationError("message_required")
    target = type(target).objects.select_for_update().get(pk=target.pk)
    if active_block(target) is not None:
        raise ModerationError("already_blocked")
    created = Block.objects.create(
        target_type=_type_of(target),
        category=category,
        message=message.strip(),
        created_by=by,
        **{_type_of(target): target},
    )
    target.blocked_at = timezone.now()
    target.save(update_fields=["blocked_at", "updated_at"])
    _close_reports(open_reports(target), Report.Status.RESOLVED)
    _audit(AuditEvent.Kind.BLOCKED, by, target, category=category)
    _mail_team(
        owning_project(target),
        "moderation/email/blocked",
        {"what": _describe(target), "message": created.message},
    )
    return created


@transaction.atomic
def lift(block_obj: Block, by, *, via_appeal: bool = False) -> None:
    block_obj = Block.objects.select_for_update().get(pk=block_obj.pk)
    if block_obj.lifted_at is not None:
        raise ModerationError("not_blocked")
    target = block_obj.target
    block_obj.lifted_at = timezone.now()
    block_obj.lifted_by = by
    block_obj.save(update_fields=["lifted_at", "lifted_by", "updated_at"])
    target.blocked_at = None
    target.save(update_fields=["blocked_at", "updated_at"])
    _audit(AuditEvent.Kind.UNBLOCKED, by, target, via_appeal=via_appeal)
    if not via_appeal:
        _mail_team(
            owning_project(target), "moderation/email/unblocked", {"what": _describe(target)}
        )


@transaction.atomic
def warn(target, by, message: str) -> ModerationNote:
    if not message.strip():
        raise ModerationError("message_required")
    project = owning_project(target)
    note = ModerationNote.objects.create(project=project, text=message.strip(), created_by=by)
    _close_reports(open_reports(target), Report.Status.RESOLVED)
    _audit(AuditEvent.Kind.WARNED, by, target)
    _mail_team(
        project, "moderation/email/warned", {"what": _describe(target), "message": note.text}
    )
    return note


@transaction.atomic
def dismiss(target, by) -> None:
    reports = open_reports(target)
    if not reports.exists():
        raise ModerationError("nothing_open")
    _close_reports(reports, Report.Status.DISMISSED)
    _audit(AuditEvent.Kind.REPORTS_DISMISSED, by, target)


@transaction.atomic
def lift_suspension(link: CampaignLink, by) -> None:
    """The link is fine after all: served again; the open malware reports are dismissed."""
    link = CampaignLink.objects.select_for_update().get(pk=link.pk)
    if link.suspended_at is None:
        raise ModerationError("not_suspended")
    link.suspended_at = None
    link.suspended_reason = ""
    link.save(update_fields=["suspended_at", "suspended_reason", "updated_at"])
    _close_reports(open_reports(link).filter(reason=Report.Reason.MALWARE), Report.Status.DISMISSED)
    _audit(AuditEvent.Kind.SUSPENSION_LIFTED, by, link)


@transaction.atomic
def appeal(block_obj: Block, by, text: str) -> Block:
    """One appeal per block, by a member of the project's team."""
    block_obj = Block.objects.select_for_update().get(pk=block_obj.pk)
    if block_obj.lifted_at is not None:
        raise ModerationError("not_blocked")
    if block_obj.appealed_at is not None:
        raise ModerationError("already_appealed")
    if not text.strip():
        raise ModerationError("message_required")
    block_obj.appeal_text = text.strip()
    block_obj.appealed_at = timezone.now()
    block_obj.appealed_by = by
    block_obj.save(update_fields=["appeal_text", "appealed_at", "appealed_by", "updated_at"])
    _audit(AuditEvent.Kind.APPEALED, by, block_obj.target)
    return block_obj


@transaction.atomic
def decide_appeal(block_obj: Block, by, decision: str) -> None:
    block_obj = Block.objects.select_for_update().get(pk=block_obj.pk)
    if block_obj.appealed_at is None or block_obj.appeal_decision:
        raise ModerationError("no_open_appeal")
    if decision not in Block.Decision.values:
        raise ModerationError("invalid_decision")
    block_obj.appeal_decision = decision
    block_obj.appeal_decided_at = timezone.now()
    block_obj.save(update_fields=["appeal_decision", "appeal_decided_at", "updated_at"])
    target = block_obj.target
    if decision == Block.Decision.LIFTED:
        lift(block_obj, by, via_appeal=True)
    _audit(AuditEvent.Kind.APPEAL_DECIDED, by, target, decision=decision)
    _mail_team(
        owning_project(target),
        "moderation/email/appeal_decided",
        {"what": _describe(target), "lifted": decision == Block.Decision.LIFTED},
    )


def team_block_info(target) -> dict | None:
    """What the team sees about a block of its content (owner's decision: reason visible)."""
    found = active_block(target)
    if found is None:
        return None
    return {
        "block": str(found.pk),
        "category": found.category,
        "message": found.message,
        "blocked_at": found.created_at.isoformat(),
        "appeal": ("none" if found.appealed_at is None else (found.appeal_decision or "pending")),
    }
