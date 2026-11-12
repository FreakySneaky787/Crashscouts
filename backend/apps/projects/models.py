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

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("slug"), name="projects_project_slug_ci_unique"),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def is_open_source(self) -> bool:
        return self.license.is_open_source


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


class SlugHistory(BaseModel):
    """Former short names; /p/<old> redirects to the current name."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="former_slugs")
    slug = models.CharField(max_length=40, unique=True)

    def __str__(self) -> str:
        return f"{self.slug} -> {self.project.slug}"
