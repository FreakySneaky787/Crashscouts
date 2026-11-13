"""Writes for campaigns. Views stay thin; permissions are checked by the caller (policies)."""

from allauth.mfa.utils import is_mfa_enabled
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.projects.models import Project
from apps.projects.services import has_confirmed_email

from . import status
from .models import Campaign, CampaignSlugHistory
from .policies import public_campaigns_enabled
from .selectors import participant_count


class CampaignError(Exception):
    """A refused change; ``code`` goes to the frontend."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def ensure_unblocked(campaign: Campaign) -> None:
    """Blocked content cannot be changed by its team (ADR 0020)."""
    if campaign.blocked_at is not None or campaign.project.blocked_at is not None:
        raise CampaignError("blocked")


# Fields that shape who can take part and how; frozen once the campaign is published.
LOCKED_AFTER_PUBLISH = ("visibility", "participation", "method")


@transaction.atomic
def create_campaign(user, project: Project, **fields) -> Campaign:
    if project.blocked_at is not None:
        raise CampaignError("blocked")
    platforms = fields.pop("platforms", [])
    campaign = Campaign.objects.create(project=project, **fields)
    campaign.platforms.set(platforms)
    from .questions import ensure_default_question  # avoid an import cycle

    ensure_default_question(campaign)
    record(
        AuditEvent.Kind.CAMPAIGN_CREATED,
        actor=user,
        data={"project": str(project.pk), "campaign": str(campaign.pk)},
    )
    return campaign


@transaction.atomic
def update_campaign(user, campaign: Campaign, **fields) -> Campaign:
    ensure_unblocked(campaign)
    if campaign.state in (Campaign.State.COMPLETED, Campaign.State.CANCELLED):
        raise CampaignError("campaign_closed")
    if campaign.state in (Campaign.State.PUBLISHED, Campaign.State.IN_REVIEW) and any(
        key in fields and fields[key] != getattr(campaign, key) for key in LOCKED_AFTER_PUBLISH
    ):
        raise CampaignError("locked_after_publish")
    if "target_testers" in fields and fields["target_testers"] < participant_count(campaign):
        raise CampaignError("below_participants")
    if "method" in fields and fields["method"] != campaign.method:
        from .tasks import ensure_method_change_allowed  # avoid an import cycle

        ensure_method_change_allowed(campaign, fields["method"])
    new_slug = fields.pop("slug", campaign.slug)
    platforms = fields.pop("platforms", None)
    for key, value in fields.items():
        setattr(campaign, key, value)
    campaign.save()
    if platforms is not None:
        campaign.platforms.set(platforms)
    if "participation" in fields:
        from .questions import ensure_default_question

        ensure_default_question(campaign)
    _rename(campaign, new_slug)
    return campaign


def _rename(campaign: Campaign, new_slug: str) -> None:
    if new_slug == campaign.slug:
        return
    CampaignSlugHistory.objects.filter(project=campaign.project, slug=new_slug).delete()
    CampaignSlugHistory.objects.create(
        campaign=campaign, project=campaign.project, slug=campaign.slug
    )
    campaign.slug = new_slug
    campaign.save(update_fields=["slug", "updated_at"])


AUDIT_KINDS = {
    status.IN_REVIEW: AuditEvent.Kind.CAMPAIGN_SUBMITTED,
    status.PUBLISHED: AuditEvent.Kind.CAMPAIGN_PUBLISHED,
    status.COMPLETED: AuditEvent.Kind.CAMPAIGN_COMPLETED,
    status.CANCELLED: AuditEvent.Kind.CAMPAIGN_CANCELLED,
}


@transaction.atomic
def change_state(user, campaign: Campaign, new_state: str) -> Campaign:
    campaign = Campaign.objects.select_for_update().select_related("project").get(pk=campaign.pk)
    ensure_unblocked(campaign)
    if not status.can_transition(campaign.state, new_state):
        raise CampaignError("invalid_transition")
    if new_state == status.PUBLISHED:
        from .tasks import ensure_tasks_for_method  # avoid an import cycle

        ensure_tasks_for_method(campaign)  # structured and combined need a task (ADR 0023)
    if new_state == status.PUBLISHED and campaign.visibility == Campaign.Visibility.PUBLIC:
        # Server-side security gate: public campaigns stay drafts until phase 3B is met.
        if not public_campaigns_enabled():
            raise CampaignError("public_campaigns_locked")
        if campaign.project.visibility != Project.Visibility.PUBLIC:
            raise CampaignError("project_not_public")
        # Rule A (open question A): confirmed email and two-factor authentication to submit.
        if not has_confirmed_email(user) or not is_mfa_enabled(user):
            raise CampaignError("needs_2fa")
        # Every public campaign goes through the moderators' review first (ADR 0021).
        new_state = status.IN_REVIEW
    campaign.state = new_state
    now = timezone.now()
    fields = ["state", "updated_at"]
    if new_state == status.IN_REVIEW:
        campaign.published_by, campaign.review_note = user, ""
        fields += ["published_by", "review_note"]
    elif new_state == status.PUBLISHED:
        campaign.published_at, campaign.published_by = now, user
        fields += ["published_at", "published_by"]
    elif new_state == status.COMPLETED:
        campaign.completed_at = now
        fields.append("completed_at")
    elif new_state == status.CANCELLED:
        campaign.cancelled_at = now
        fields.append("cancelled_at")
    campaign.save(update_fields=fields)
    record(
        AUDIT_KINDS[new_state],
        actor=user,
        data={"project": str(campaign.project_id), "campaign": str(campaign.pk)},
    )
    return campaign


@transaction.atomic
def delete_draft(user, campaign: Campaign) -> None:
    ensure_unblocked(campaign)
    if campaign.state != Campaign.State.DRAFT:
        raise CampaignError("not_a_draft")  # published campaigns are completed or cancelled
    record(
        AuditEvent.Kind.CAMPAIGN_DELETED,
        actor=user,
        data={"project": str(campaign.project_id), "campaign": str(campaign.pk)},
    )
    campaign.delete()
