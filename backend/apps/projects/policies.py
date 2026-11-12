"""The only place that decides who may see or change a project (docs/ARCHITECTURE.md, policies)."""

from .models import Membership, Project


def role_of(user, project: Project) -> str | None:
    if not getattr(user, "is_authenticated", False):
        return None
    membership = Membership.objects.filter(project=project, user=user).only("role").first()
    return membership.role if membership else None


def can_view(user, project: Project) -> bool:
    return project.visibility == Project.Visibility.PUBLIC or role_of(user, project) is not None


def can_edit(user, project: Project) -> bool:
    return role_of(user, project) in {Membership.Role.OWNER, Membership.Role.MAINTAINER}


def can_delete(user, project: Project) -> bool:
    return role_of(user, project) == Membership.Role.OWNER
