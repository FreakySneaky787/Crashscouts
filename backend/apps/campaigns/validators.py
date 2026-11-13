from functools import cache
from zoneinfo import available_timezones

from django.core.exceptions import ValidationError

from apps.projects.validators import SLUG_PATTERN

RESERVED_SLUGS = {"new", "edit", "settings", "links", "apply", "join", "invitations", "team"}


def validate_campaign_slug(value: str) -> None:
    if not SLUG_PATTERN.fullmatch(value) or "--" in value:
        raise ValidationError(
            "Use 3 to 40 characters: lowercase letters, digits and single hyphens, "
            "starting and ending with a letter or digit.",
            code="invalid_slug",
        )
    if value in RESERVED_SLUGS:
        raise ValidationError("This name is reserved.", code="reserved_slug")


@cache
def _timezones() -> frozenset[str]:
    # From the tzdata package (a direct dependency), so the list does not depend on the OS.
    return frozenset(available_timezones())


def validate_timezone(value: str) -> None:
    if value not in _timezones():
        raise ValidationError("Choose a time zone from the list.", code="invalid_timezone")
