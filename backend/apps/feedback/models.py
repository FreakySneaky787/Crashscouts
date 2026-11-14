"""Feedback of testers (phase 5, ADR 0024).

Owner's decisions (2026-11-14): private feedback is seen by the team, its author and all active
participants of the campaign; attachments only by the team and the author. Publishing needs the
team's proposal and the author's consent. The team sets the statuses up to "Fixed"; the author
confirms with "Verified" or reopens. Authors may change or withdraw their feedback while it is
"New". A feedback can be linked to a test task. The author is SET_NULL on final account deletion:
the text stays, anonymised (ADR 0013).
"""

from django.conf import settings
from django.db import models

from apps.campaigns.models import SHORT_MARKDOWN_MAX_LENGTH, Campaign, TestTask
from apps.catalog.models import Platform
from apps.core.models import BaseModel

DESCRIPTION_MAX_LENGTH = 10_000


class Feedback(BaseModel):
    class Kind(models.TextChoices):
        BUG = "bug", "Bug report"
        UX = "ux", "UX feedback"
        FEATURE = "feature", "Feature suggestion"
        COMPATIBILITY = "compatibility", "Compatibility report"
        GENERAL = "general", "General feedback"

    class Status(models.TextChoices):
        NEW = "new", "New"
        REVIEWED = "reviewed", "Reviewed"
        CONFIRMED = "confirmed", "Confirmed"
        IN_PROGRESS = "in_progress", "In progress"
        FIXED = "fixed", "Fixed"
        VERIFIED = "verified", "Verified"
        DUPLICATE = "duplicate", "Duplicate"
        CANNOT_REPRODUCE = "cannot_reproduce", "Cannot reproduce"
        REJECTED = "rejected", "Rejected"

    class Result(models.TextChoices):
        """Outcome of a compatibility report."""

        WORKS = "works", "Works"
        PARTLY = "partly", "Works partly"
        FAILS = "fails", "Does not work"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="feedback")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feedback",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=120)
    description = models.TextField(max_length=DESCRIPTION_MAX_LENGTH)
    # Type-specific fields (ADR 0024); fields that do not belong to the kind stay empty.
    steps = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    expected = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    actual = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    location = models.CharField(max_length=200, blank=True)
    suggestion = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    solution = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    environment = models.CharField(max_length=300, blank=True)
    result = models.CharField(max_length=8, choices=Result.choices, blank=True)
    platform = models.ForeignKey(
        Platform, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    version = models.CharField(max_length=50, blank=True)
    task = models.ForeignKey(
        TestTask, on_delete=models.SET_NULL, null=True, blank=True, related_name="feedback"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    duplicate_of = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="duplicates"
    )
    publish_proposed_at = models.DateTimeField(null=True, blank=True, editable=False)
    author_consented_at = models.DateTimeField(null=True, blank=True, editable=False)
    published_at = models.DateTimeField(null=True, blank=True, editable=False)
    # Hidden by moderators (WP 7.1, ADR 0026): private again and cannot be published until lifted.
    blocked_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["campaign", "status"], name="feedback_campaign_status")]

    def __str__(self) -> str:
        return f"{self.campaign}: {self.title} ({self.status})"


class FeedbackStatusChange(BaseModel):
    """History of a feedback's status. The API shows the role, never the person."""

    class Role(models.TextChoices):
        TEAM = "team", "Team"
        AUTHOR = "author", "Author"

    feedback = models.ForeignKey(Feedback, on_delete=models.CASCADE, related_name="history")
    status = models.CharField(max_length=16, choices=Feedback.Status.choices)
    role = models.CharField(max_length=8, choices=Role.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.feedback_id}: {self.status} by {self.role}"


class FeedbackAttachment(BaseModel):
    """A screenshot or a text file of a feedback (WP 5.2, ADR 0024). Seen only by the team and
    the author. Images are re-encoded (no uploaded bytes, no metadata); text files are checked
    and only ever delivered as downloads. Files live outside the web root under a random key."""

    MAX_PER_FEEDBACK = 5

    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        TEXT = "text", "Text"

    feedback = models.ForeignKey(Feedback, on_delete=models.CASCADE, related_name="attachments")
    kind = models.CharField(max_length=8, choices=Kind.choices)
    name = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    key = models.UUIDField(unique=True, editable=False)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.feedback_id}: {self.name}"
