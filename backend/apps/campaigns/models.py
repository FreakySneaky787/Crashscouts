"""Test campaigns of a project (WP 3A.1; decisions in docs/OPEN-QUESTIONS.md, ADR 0016).

- Public or private. Public campaigns can only be drafts while PUBLIC_CAMPAIGNS_ENABLED is off
  (security gate, phase 3B). Private campaigns are open to invited people only.
- Participation: public campaigns "direct" or "after approval"; private campaigns "by invitation".
- Only the team's decisions are stored in ``state``; the visible status is derived (status.py).
- The short name is unique per project and forms /p/<project>/c/<campaign>.
"""

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector, SearchVectorField
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower

from apps.catalog.models import Platform
from apps.core.models import BaseModel
from apps.projects.models import SEARCH_CONFIG, Project

from . import status
from .validators import validate_campaign_slug, validate_download_url, validate_timezone

MARKDOWN_MAX_LENGTH = 10_000
SHORT_MARKDOWN_MAX_LENGTH = 4_000
MAX_TARGET_TESTERS = 1000


# Full-text search over a campaign's own texts (ADR 0025), stored like the project's (WP 8.6).
# The project name also counts in Discover; it is added at query time (apps.discover.queries).
SEARCH_VECTOR = (
    SearchVector("title", weight="A", config=SEARCH_CONFIG)
    + SearchVector("summary", weight="B", config=SEARCH_CONFIG)
    + SearchVector("description", weight="C", config=SEARCH_CONFIG)
)


class Campaign(BaseModel):
    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    class Participation(models.TextChoices):
        DIRECT = "direct", "Direct"
        APPROVAL = "approval", "After approval"
        INVITATION = "invitation", "By invitation"

    class Method(models.TextChoices):
        """Testing method (master prompt 2.3; owner's decision 2026-11-13, ADR 0023)."""

        FREE = "free", "Free testing"
        STRUCTURED = "structured", "Structured testing"
        COMBINED = "combined", "Combined testing"

    class State(models.TextChoices):
        DRAFT = status.DRAFT, "Draft"
        IN_REVIEW = status.IN_REVIEW, "In review"
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
    method = models.CharField(max_length=12, choices=Method.choices, default=Method.FREE)
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
    # Blocked by moderators (WP 3B.3, ADR 0020): invisible to everyone but the team.
    blocked_at = models.DateTimeField(null=True, blank=True, editable=False)
    # Moderators' reason when they sent a public campaign back to draft (WP 3B.4, ADR 0021).
    review_note = models.TextField(max_length=1000, blank=True, editable=False)
    # When the team changed the state, and who published (metrics, docs/METRICS.md).
    published_at = models.DateTimeField(null=True, blank=True, editable=False)
    completed_at = models.DateTimeField(null=True, blank=True, editable=False)
    cancelled_at = models.DateTimeField(null=True, blank=True, editable=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        editable=False,
    )
    search_vector = models.GeneratedField(
        expression=SEARCH_VECTOR, output_field=SearchVectorField(), db_persist=True
    )

    class Meta:
        ordering = ["-starts_at", "title"]
        indexes = [GinIndex(fields=["search_vector"], name="campaigns_campaign_search_gin")]
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


class CampaignLink(BaseModel):
    """A download link of a campaign (WP 3A.3). Never fetched by the server; shown only to the
    team and participants, always behind a warning page."""

    MAX_PER_CAMPAIGN = 10

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="links")
    label = models.CharField(max_length=80)
    url = models.CharField(max_length=500, validators=[validate_download_url])
    platform = models.ForeignKey(
        Platform, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Optional SHA-256 of the file, lowercase hex, so testers can check the download.
    sha256 = models.CharField(max_length=64, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    # Suspended links are served to no one (WP 3B.2: automatic suspension after malware reports;
    # moderators lift or confirm it in WP 3B.3).
    suspended_at = models.DateTimeField(null=True, blank=True, editable=False)
    suspended_reason = models.CharField(max_length=40, blank=True, editable=False)
    blocked_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Review(models.TextChoices):
        APPROVED = "approved", "Approved"
        PENDING = "pending", "Waiting for review"
        REJECTED = "rejected", "Rejected"

    # Links of public campaigns are reviewed before anyone gets them (WP 3B.4, ADR 0021).
    review_status = models.CharField(
        max_length=10, choices=Review.choices, default=Review.APPROVED, editable=False
    )
    review_note = models.TextField(max_length=1000, blank=True, editable=False)

    def is_served(self) -> bool:
        """Whether this link may be shown to anyone at all (ADR 0019, ADR 0020)."""
        campaign = self.campaign
        return (
            self.review_status == self.Review.APPROVED
            and self.suspended_at is None
            and self.blocked_at is None
            and campaign.blocked_at is None
            and campaign.project.blocked_at is None
        )

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"{self.campaign}: {self.label}"


class CampaignInvitation(BaseModel):
    """Invitation to a private campaign, by username (owner's decision, 2026-11-13).
    Accepting it makes the person a participant, as long as places are free."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        REVOKED = "revoked", "Revoked"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="invitations")
    invitee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campaign_invitations"
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "invitee"],
                condition=Q(status="pending"),
                name="campaigns_one_pending_invitation",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.invitee} to {self.campaign} ({self.status})"


class Participation(BaseModel):
    """Someone taking part in a campaign. Active participations count against the hard limit
    (``target_testers``); leaving and removal follow in WP 3A.4a."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        LEFT = "left", "Left"
        REMOVED = "removed", "Removed"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="participations")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="participations"
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "user"], name="campaigns_one_participation"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} in {self.campaign} ({self.status})"


class ApplicationQuestion(BaseModel):
    """A question applicants answer (WP 3A.4b; owner's decision: per-campaign questions with
    templates). Editable only while the campaign is a draft."""

    MAX_PER_CAMPAIGN = 10
    MAX_OPTIONS = 10

    class Kind(models.TextChoices):
        SHORT_TEXT = "short_text", "Short text"
        LONG_TEXT = "long_text", "Long text"
        SINGLE_CHOICE = "single_choice", "Single choice"
        YES_NO = "yes_no", "Yes or no"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="questions")
    prompt = models.CharField(max_length=200)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    options = models.JSONField(default=list, blank=True)  # single_choice only
    required = models.BooleanField(default=False)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"{self.campaign}: {self.prompt}"


class Application(BaseModel):
    """An application to a campaign with approval (WP 3A.4b). The answers are visible to the team
    only and deleted on rejection, withdrawal, leaving, removal and 30 days after the campaign
    ends (owner's decision, 2026-11-13)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="applications")
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campaign_applications"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "applicant"], name="campaigns_one_application"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.applicant} to {self.campaign} ({self.status})"


class ApplicationAnswer(BaseModel):
    """One answer; the question text is kept with it so it stays readable on its own."""

    MAX_LENGTH = 2000

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(
        ApplicationQuestion, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    prompt = models.CharField(max_length=200)
    value = models.TextField(max_length=MAX_LENGTH)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position"]

    def __str__(self) -> str:
        return f"{self.application}: {self.prompt}"


class TestTask(BaseModel):
    """A task of a structured or combined campaign (WP 4.1, ADR 0023). Visible to everyone who
    sees the campaign. A task with reported progress is hidden instead of deleted, so the team
    keeps what testers reported."""

    MAX_PER_CAMPAIGN = 30
    __test__ = False  # not a pytest test class despite the name

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=120)
    instructions = models.TextField(max_length=SHORT_MARKDOWN_MAX_LENGTH, blank=True)
    expected_result = models.TextField(max_length=1000, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    hidden_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"{self.campaign}: {self.title}"


class TaskProgress(BaseModel):
    """One participant's status of one task; no row means "not started". Belongs to the
    participation, so it stays when someone leaves or is removed and continues when they come
    back; it is deleted with the account (owner's decision 2026-11-13)."""

    NOTE_MAX_LENGTH = 1000

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        BLOCKED = "blocked", "Blocked"

    participation = models.ForeignKey(
        Participation, on_delete=models.CASCADE, related_name="task_progress"
    )
    task = models.ForeignKey(TestTask, on_delete=models.CASCADE, related_name="progress")
    status = models.CharField(max_length=12, choices=Status.choices)
    note = models.TextField(max_length=NOTE_MAX_LENGTH, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["participation", "task"], name="campaigns_one_progress_per_task"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.participation}: {self.task.title} ({self.status})"
