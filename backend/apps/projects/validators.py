import re

from django.core.exceptions import ValidationError

SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$")

# Names that collide with routes or could be mistaken for the platform.
RESERVED_SLUGS = {
    "new",
    "edit",
    "settings",
    "admin",
    "api",
    "about",
    "help",
    "official",
    "security",
    "support",
    "projects",
    "campaigns",
    "discover",
    "search",
}


def validate_project_slug(value: str) -> None:
    if not SLUG_PATTERN.fullmatch(value) or "--" in value:
        raise ValidationError(
            "Use 3 to 40 characters: lowercase letters, digits and single hyphens, "
            "starting and ending with a letter or digit.",
            code="invalid_slug",
        )
    if value in RESERVED_SLUGS:
        raise ValidationError("This name is reserved.", code="reserved_slug")
