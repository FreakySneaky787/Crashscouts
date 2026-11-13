"""Test campaigns of a project (WP 3A.1; decisions in docs/OPEN-QUESTIONS.md, ADR 0016).

- Public or private. Public campaigns can only be drafts while PUBLIC_CAMPAIGNS_ENABLED is off
  (security gate, phase 3B). Private campaigns are open to invited people only.
- Participation: public campaigns "direct" or "after approval"; private campaigns "by invitation".
- Only the team's decisions are stored in ``state``; the visible status is derived (status.py).
- The short name is unique per project and forms /p/<project>/c/<campaign>.
"""

from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower

from apps.catalog.models import Platform
from apps.core.models import BaseModel
from apps.projects.models import Project

from . import status
from .validators import validate_campaign_slug, validate_timezone

MARKDOWN_MAX_LENGTH = 10_000
SHORT_MARKDOWN_MAX_LENGTH = 4_000
MAX_TARGET_TESTERS = 1000


class Campaign(BaseModel):
    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    class Participation(models.TextChoices):
        DIRECT = "direct", "Direct"
        APPROVAL = "approval", "After approval"
        INVITATION = "invitation", "By invitation"

    class State(models.TextChoices):
        DRAFT = status.DRAFT, "Draft"
        PUBLISHED = status.PUBLISHED, "Published"
        COMPLETED = status.COMPLETED, "Completed"
        CANCELLED = status.CANCELLED, "Cancelled"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="campaigns")
    slug = models.CharField(max_length=40, validators=[validate_campaign_slug])
    title = models.CharField(max_length=100)
    summary = models.CharField(max_length=160, help_text="One sentence for lists.")
    description = models.TextField(max_length=MARKDOWN_MAX_LENGTH, blank=True)
    version = models.CharField(max_length=50)
    changelog = models.TextField(max_length=MARKDOWN_MAX_LENGTH, blank=True)
    hardware_requirements = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    prerequisites = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    methodology = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    # The team's time zone (IANA name): start and end are shown and edited in it.
    timezone = models.CharField(
        max_length=64, default="Europe/Zurich", validators=[validate_timezone]
    )
    target_testers = models.PositiveIntegerField()
    platforms = models.ManyToManyField(Platform, blank=True, related_name="+")
    visibility = models.CharField(
        max_length=8, choices=Visibility.choices, default=Visibility.PRIVATE
    )
    participation = models.CharField(
        max_length=12, choices=Participation.choices, default=Participation.INVITATION
    )
    state = models.CharField(max_length=12, choices=State.choices, default=State.DRAFT)

    class Meta:
        ordering = ["-starts_at", "title"]
        constraints = [
            models.UniqueConstraint(
                "project", Lower("slug"), name="campaigns_slug_unique_per_project"
            ),
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")), name="campaigns_ends_after_start"
            ),
            models.CheckConstraint(
                condition=Q(target_testers__gte=1, target_testers__lte=MAX_TARGET_TESTERS),
                name="campaigns_target_testers_range",
            ),
            # Private campaigns take invited people only; public ones never use invitations.
            models.CheckConstraint(
                condition=(
                    Q(visibility="private", participation="invitation")
                    | Q(visibility="public", participation__in=["direct", "approval"])
                ),
                name="campaigns_participation_matches_visibility",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.project}: {self.title}"


class CampaignSlugHistory(BaseModel):
    """Former short names; /p/<project>/c/<old> redirects to the current one."""

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="former_slugs")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="+")
    slug = models.CharField(max_length=40)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "slug"], name="campaigns_former_slug_unique_per_project"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.slug} -> {self.campaign.slug}"
