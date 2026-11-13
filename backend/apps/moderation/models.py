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
