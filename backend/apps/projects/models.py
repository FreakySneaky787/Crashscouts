"""Projects and their team (WP 2.2; decisions in docs/OPEN-QUESTIONS.md).

- Public or private: private projects exist only for their members (404 for everyone else).
- Roles: exactly one owner, any number of maintainers (added by accepted invitation, WP 2.3).
- The short name (slug) forms the URL /p/<slug>; old slugs keep redirecting after a rename.
- The description is Markdown; it is rendered with a fixed allowlist in the frontend.
"""

from django.conf import settings
from django.core.validators import URLValidator
from django.db import models
from django.db.models.functions import Lower

from apps.catalog.models import Category, License, Platform, ProgrammingLanguage
from apps.core.models import BaseModel

from .validators import validate_project_slug

DESCRIPTION_MAX_LENGTH = 10_000


class Project(BaseModel):
    class Status(models.TextChoices):
        DEVELOPMENT = "development", "Development"
        ALPHA = "alpha", "Alpha"
        BETA = "beta", "Beta"
        STABLE = "stable", "Stable"
        ARCHIVED = "archived", "Archived"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    slug = models.CharField(max_length=40, unique=True, validators=[validate_project_slug])
    name = models.CharField(max_length=80)
    summary = models.CharField(
        max_length=160, help_text="One sentence for lists and link previews."
    )
    description = models.TextField(max_length=DESCRIPTION_MAX_LENGTH, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DEVELOPMENT)
    visibility = models.CharField(
        max_length=8, choices=Visibility.choices, default=Visibility.PRIVATE
    )
    license = models.ForeignKey(License, on_delete=models.PROTECT, related_name="+")
    repository_url = models.URLField(
        max_length=300, blank=True, validators=[URLValidator(schemes=["https"])]
    )
    categories = models.ManyToManyField(Category, blank=True, related_name="+")
    platforms = models.ManyToManyField(Platform, blank=True, related_name="+")
    languages = models.ManyToManyField(ProgrammingLanguage, blank=True, related_name="+")
    # Random name of the stored logo (projects/logos/<key>.webp); a new upload gets a new key.
    logo_key = models.UUIDField(null=True, blank=True, unique=True, editable=False)
    # Blocked by moderators (WP 3B.3, ADR 0020): invisible to everyone but the team.
    blocked_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("slug"), name="projects_project_slug_ci_unique"),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def is_open_source(self) -> bool:
        return self.license.is_open_source


class Screenshot(BaseModel):
    """A re-encoded screenshot (projects/screenshots/<key>.webp) with a required description."""

    MAX_PER_PROJECT = 8

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="screenshots")
    key = models.UUIDField(unique=True, editable=False)
    alt_text = models.CharField(max_length=200)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"Screenshot of {self.project}: {self.alt_text}"


class Membership(BaseModel):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        MAINTAINER = "maintainer", "Maintainer"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_memberships"
    )
    role = models.CharField(max_length=16, choices=Role.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "user"], name="projects_one_membership"),
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(role="owner"),
                name="projects_exactly_one_owner",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} ({self.role}) in {self.project}"


class Invitation(BaseModel):
    """Invitation to become a maintainer; nobody joins a project without accepting (decision)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        REVOKED = "revoked", "Revoked"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="invitations")
    invitee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_invitations"
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "invitee"],
                condition=models.Q(status="pending"),
                name="projects_one_pending_invitation",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.invitee} to {self.project} ({self.status})"


class SlugHistory(BaseModel):
    """Former short names; /p/<old> redirects to the current name."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="former_slugs")
    slug = models.CharField(max_length=40, unique=True)

    def __str__(self) -> str:
        return f"{self.slug} -> {self.project.slug}"


class RepositoryVerification(BaseModel):
    """Proof that a project belongs to its repository (WP 2.5, ADR 0015).

    One row per project. The check code belongs to exactly one repository URL, and the proof counts
    only while the project still links to that URL: changing the link removes the row.
    """

    class Method(models.TextChoices):
        FILE = "file", "Check file"
        GITHUB = "github", "GitHub authorization"

    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="verification")
    repository_url = models.CharField(max_length=300)
    code = models.CharField(max_length=64)
    method = models.CharField(max_length=8, choices=Method.choices, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    def __str__(self) -> str:
        state = f"verified ({self.method})" if self.verified_at else "not verified"
        return f"{self.project}: {state}"

    def is_valid_for(self, project: Project) -> bool:
        return self.verified_at is not None and self.repository_url == project.repository_url
