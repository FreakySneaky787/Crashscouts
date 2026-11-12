"""Project logo and screenshots through the shared image pipeline (ADR 0010).

Files of private projects are delivered only to the team; the delivery view checks the project's
visibility on every request.
"""

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.core import images

from .models import Project, Screenshot

LOGO_PREFIX = "projects/logos"
SCREENSHOT_PREFIX = "projects/screenshots"
LOGO_MAX_BYTES = 2 * 1024 * 1024
LOGO_SIZE = 256
SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024
SCREENSHOT_MAX_SIDE = 1600


class ImageLimitError(Exception):
    pass


def set_logo(project: Project, upload) -> None:
    encoded = images.reencode(upload, max_bytes=LOGO_MAX_BYTES, square=LOGO_SIZE)
    old = project.logo_key
    project.logo_key = images.store(LOGO_PREFIX, encoded.data)
    project.save(update_fields=["logo_key", "updated_at"])
    transaction.on_commit(lambda: images.delete(LOGO_PREFIX, old))


def remove_logo(project: Project) -> None:
    old = project.logo_key
    project.logo_key = None
    project.save(update_fields=["logo_key", "updated_at"])
    transaction.on_commit(lambda: images.delete(LOGO_PREFIX, old))


def add_screenshot(project: Project, upload, alt_text: str) -> Screenshot:
    if project.screenshots.count() >= Screenshot.MAX_PER_PROJECT:
        raise ImageLimitError
    encoded = images.reencode(upload, max_bytes=SCREENSHOT_MAX_BYTES, max_side=SCREENSHOT_MAX_SIDE)
    key = images.store(SCREENSHOT_PREFIX, encoded.data)
    position = project.screenshots.count()
    return Screenshot.objects.create(
        project=project,
        key=key,
        alt_text=alt_text,
        width=encoded.width,
        height=encoded.height,
        position=position,
    )


def image_file(key) -> tuple[Project, str] | None:
    """The project and storage path for a logo or screenshot key, or None."""
    project = Project.objects.filter(logo_key=key).first()
    if project is not None:
        return project, f"{LOGO_PREFIX}/{key}.webp"
    screenshot = Screenshot.objects.select_related("project").filter(key=key).first()
    if screenshot is not None:
        return screenshot.project, f"{SCREENSHOT_PREFIX}/{key}.webp"
    return None


# Files go when their database rows go (also when a project or account is deleted).
@receiver(post_delete, sender=Screenshot)
def _delete_screenshot_file(sender, instance, **kwargs):
    transaction.on_commit(lambda: images.delete(SCREENSHOT_PREFIX, instance.key))


@receiver(post_delete, sender=Project)
def _delete_logo_file(sender, instance, **kwargs):
    transaction.on_commit(lambda: images.delete(LOGO_PREFIX, instance.logo_key))
