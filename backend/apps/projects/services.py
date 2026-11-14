from allauth.account.adapter import get_adapter
from allauth.account.models import EmailAddress
from django.db import transaction

from apps.audit.models import AuditEvent
from apps.audit.services import record

from .models import Membership, Project, SlugHistory


def has_confirmed_email(user) -> bool:
    return EmailAddress.objects.filter(user=user, verified=True).exists()


# Catalog lists of a project (many-to-many); set as a whole on create and update.
LIST_FIELDS = ("categories", "platforms", "languages", "software_types")


@transaction.atomic
def create_project(user, **fields) -> Project:
    lists = {key: fields.pop(key, []) for key in LIST_FIELDS}
    project = Project.objects.create(**fields)
    for key, items in lists.items():
        getattr(project, key).set(items)
    Membership.objects.create(project=project, user=user, role=Membership.Role.OWNER)
    return project


@transaction.atomic
def rename(project: Project, new_slug: str) -> None:
    """Changes the short name; the old one keeps redirecting (and is reserved for this project)."""
    if new_slug == project.slug:
        return
    SlugHistory.objects.filter(project=project, slug=new_slug).delete()  # renamed back
    SlugHistory.objects.create(project=project, slug=project.slug)
    project.slug = new_slug
    project.save(update_fields=["slug", "updated_at"])


def owned_projects(user):
    return Project.objects.filter(memberships__user=user, memberships__role=Membership.Role.OWNER)


@transaction.atomic
def hand_over_or_delete_owned_projects(user) -> dict:
    """Before an account is deleted for good: the longest-serving maintainer becomes owner;
    projects without maintainers are deleted. Returns counts for logging."""
    result = {"handed_over": 0, "deleted": 0}
    for project in owned_projects(user):
        successor = (
            Membership.objects.filter(project=project, role=Membership.Role.MAINTAINER)
            .exclude(user=user)
            .select_related("user")
            .order_by("created_at")
            .first()
        )
        if successor is None:
            record(
                AuditEvent.Kind.PROJECT_DELETED,
                data={"project": str(project.pk), "reason": "owner_deleted"},
            )
            project.delete()
            result["deleted"] += 1
            continue
        Membership.objects.filter(project=project, user=user).delete()
        successor.role = Membership.Role.OWNER
        successor.save(update_fields=["role", "updated_at"])
        record(
            AuditEvent.Kind.PROJECT_OWNER_CHANGED,
            subject=successor.user,
            data={"project": str(project.pk)},
        )
        if successor.user.email:
            get_adapter().send_mail(
                "projects/email/ownership_received",
                successor.user.email,
                {"username": successor.user.username, "project_name": project.name},
            )
        result["handed_over"] += 1
    return result
