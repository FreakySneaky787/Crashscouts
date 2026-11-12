from django.db.models import QuerySet

from .models import Project, SlugHistory
from .policies import can_view
from .validators import SLUG_PATTERN


def project_for(user, slug: str) -> Project | None:
    """The project behind a current or former short name, if the user may see it; else None.

    Unknown names and private projects of others both return None (callers answer 404), so the
    existence of a private project is never revealed: not even through a former name.
    """
    slug = slug.lower()
    if not SLUG_PATTERN.fullmatch(slug):
        return None
    project = Project.objects.select_related("license").filter(slug=slug).first()
    if project is None:
        former = SlugHistory.objects.select_related("project__license").filter(slug=slug).first()
        project = former.project if former else None
    if project is None or not can_view(user, project):
        return None
    return project


def projects_of(user) -> QuerySet[Project]:
    return (
        Project.objects.filter(memberships__user=user)
        .select_related("license")
        .order_by("name")
        .distinct()
    )
