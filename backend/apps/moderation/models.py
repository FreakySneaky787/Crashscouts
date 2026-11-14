"""Reports of projects, campaigns, download links, users and published feedback (WP 3B.2,
ADR 0019; users and feedback since WP 7.1, ADR 0026).

The report keeps a copy of what was reported (``target_label``), so moderators can follow a case
even after the content was deleted; the references are set to NULL then. Reporters are set to
NULL when their account is deleted; the report itself stays for moderation.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.campaigns.models import Campaign, CampaignLink
from apps.core.models import BaseModel
from apps.feedback.models import Feedback
from apps.projects.models import Project

TEXT_MAX_LENGTH = 1000
OPEN_STATES = ("open", "in_review")


class Report(BaseModel):
    class TargetType(models.TextChoices):
        PROJECT = "project", "Project"
        CAMPAIGN = "campaign", "Campaign"
        LINK = "link", "Download link"
        USER = "user", "User"
        FEEDBACK = "feedback", "Published feedback"

    class Reason(models.TextChoices):
        # Owner's decision (2026-11-13); malware comes first in the moderation queue.
        MALWARE = "malware", "Malware or dangerous download"
        DECEPTION = "deception", "Deception or phishing"
        NOT_OWN_SOFTWARE = "not_own_software", "Someone else's software passed off as own"
        SPAM = "spam", "Spam"
        LEGAL = "legal", "Legal violation"
        OTHER = "other", "Other"
        # Reasons for reporting a person (owner's decision 2026-11-14).
        HARASSMENT = "harassment", "Harassment or insults"
        IMPERSONATION = "impersonation", "Impersonation"
        INAPPROPRIATE_PROFILE = "inappropriate_profile", "Inappropriate profile"

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
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reports_about",
    )
    feedback = models.ForeignKey(
        Feedback, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    target_label = models.CharField(max_length=300)
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reports",
    )
    reason = models.CharField(max_length=24, choices=Reason.choices)
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
                for field in ("project", "campaign", "link", "user", "feedback")
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
    feedback = models.ForeignKey(
        Feedback, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    category = models.CharField(max_length=24, choices=Report.Reason.choices)
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
                for field in ("project", "campaign", "link", "feedback")
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
        if self.target_type == Report.TargetType.FEEDBACK:
            return self.feedback.campaign.project
        return self.link.campaign.project


class ModerationNote(BaseModel):
    """A warning to a project's team or to a person, kept for moderators only (owner's decisions
    2026-11-13 and 2026-11-14). Exactly one of ``project`` and ``user`` is set."""

    project = models.ForeignKey(
        Project, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="moderation_notes",
    )
    text = models.TextField(max_length=Block.MESSAGE_MAX_LENGTH)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Warning for {self.project or self.user}"


class AccountSuspension(BaseModel):
    """A moderator suspends an account (WP 7.2, ADR 0027): read only until ``ends_at`` (``None``
    = permanent) or until lifted. One appeal by the person, decided by any moderator.

    Owner's decisions (2026-11-14): sign-in, reading, export and deletion stay possible; creating,
    reporting, feedback, joining and inviting do not; the profile is hidden from others; any
    moderator suspends with a free end date or permanently and decides the appeal.
    """

    MESSAGE_MAX_LENGTH = Block.MESSAGE_MAX_LENGTH
    Decision = Block.Decision

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="suspensions"
    )
    category = models.CharField(max_length=24, choices=Report.Reason.choices)
    message = models.TextField(max_length=MESSAGE_MAX_LENGTH)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    lifted_at = models.DateTimeField(null=True, blank=True)
    lifted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    appeal_text = models.TextField(max_length=MESSAGE_MAX_LENGTH, blank=True)
    appealed_at = models.DateTimeField(null=True, blank=True)
    appeal_decision = models.CharField(max_length=8, choices=Decision.choices, blank=True)
    appeal_decided_at = models.DateTimeField(null=True, blank=True)
    appeal_decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "lifted_at"])]

    def __str__(self) -> str:
        return f"Suspension ({'lifted' if self.lifted_at else 'active or expired'})"
