"""Reports of projects, campaigns and download links (WP 3B.2, ADR 0019).

The report keeps a copy of what was reported (``target_label``), so moderators can follow a case
even after the content was deleted; the references are set to NULL then. Reporters are set to
NULL when their account is deleted; the report itself stays for moderation.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.campaigns.models import Campaign, CampaignLink
from apps.core.models import BaseModel
from apps.projects.models import Project

TEXT_MAX_LENGTH = 1000
OPEN_STATES = ("open", "in_review")


class Report(BaseModel):
    class TargetType(models.TextChoices):
        PROJECT = "project", "Project"
        CAMPAIGN = "campaign", "Campaign"
        LINK = "link", "Download link"

    class Reason(models.TextChoices):
        # Owner's decision (2026-11-13); malware comes first in the moderation queue.
        MALWARE = "malware", "Malware or dangerous download"
        DECEPTION = "deception", "Deception or phishing"
        NOT_OWN_SOFTWARE = "not_own_software", "Someone else's software passed off as own"
        SPAM = "spam", "Spam"
        LEGAL = "legal", "Legal violation"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_REVIEW = "in_review", "In review"
        RESOLVED = "resolved", "Resolved"
        DISMISSED = "dismissed", "Dismissed"

    target_type = models.CharField(max_length=10, choices=TargetType.choices)
    project = models.ForeignKey(
        Project, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    campaign = models.ForeignKey(
        Campaign, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    link = models.ForeignKey(
        CampaignLink, null=True, blank=True, on_delete=models.SET_NULL, related_name="reports"
    )
    target_label = models.CharField(max_length=300)
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reports",
    )
    reason = models.CharField(max_length=20, choices=Reason.choices)
    text = models.TextField(max_length=TEXT_MAX_LENGTH, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # One open report per reporter and content (owner's decision).
            *(
                models.UniqueConstraint(
                    fields=["reporter", field],
                    condition=Q(target_type=field, status__in=OPEN_STATES),
                    name=f"moderation_one_open_report_per_{field}",
                )
                for field in ("project", "campaign", "link")
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_reason_display()}: {self.target_label} ({self.status})"


class Block(BaseModel):
    """A moderators' block (WP 3B.3, ADR 0020): the content is invisible to everyone but its
    team, links are served to no one; reversible; one appeal per block."""

    MESSAGE_MAX_LENGTH = 1000

    class Decision(models.TextChoices):
        UPHELD = "upheld", "Upheld"
        LIFTED = "lifted", "Lifted"

    target_type = models.CharField(max_length=10, choices=Report.TargetType.choices)
    project = models.ForeignKey(
        Project, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    campaign = models.ForeignKey(
        Campaign, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    link = models.ForeignKey(
        CampaignLink, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    category = models.CharField(max_length=20, choices=Report.Reason.choices)
    message = models.TextField(max_length=MESSAGE_MAX_LENGTH)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    lifted_at = models.DateTimeField(null=True, blank=True)
    lifted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    appeal_text = models.TextField(max_length=MESSAGE_MAX_LENGTH, blank=True)
    appealed_at = models.DateTimeField(null=True, blank=True)
    appealed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    appeal_decision = models.CharField(max_length=8, choices=Decision.choices, blank=True)
    appeal_decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            *(
                models.UniqueConstraint(
                    fields=[field],
                    condition=Q(target_type=field, lifted_at__isnull=True),
                    name=f"moderation_one_active_block_per_{field}",
                )
                for field in ("project", "campaign", "link")
            ),
        ]

    def __str__(self) -> str:
        return f"Block of {self.target_type} ({'lifted' if self.lifted_at else 'active'})"

    @property
    def target(self):
        return getattr(self, self.target_type)

    @property
    def owning_project(self) -> Project:
        if self.target_type == Report.TargetType.PROJECT:
            return self.project
        if self.target_type == Report.TargetType.CAMPAIGN:
            return self.campaign.project
        return self.link.campaign.project


class ModerationNote(BaseModel):
    """A warning to a project's team, kept for moderators only (owner's decision 2026-11-13)."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="+")
    text = models.TextField(max_length=Block.MESSAGE_MAX_LENGTH)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Warning for {self.project}"
