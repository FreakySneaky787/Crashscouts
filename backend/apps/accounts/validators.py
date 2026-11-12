"""Validators for usernames and passwords (docs/OPEN-QUESTIONS.md, L and M; ADR 0009)."""

import re

from django.core.exceptions import ValidationError

USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,29}$")

# Names that could be mistaken for the platform, staff or system addresses, or that collide
# with likely URL segments. Compared case-insensitively by allauth (ACCOUNT_USERNAME_BLACKLIST).
RESERVED_USERNAMES = [
    "about",
    "abuse",
    "account",
    "accounts",
    "admin",
    "administrator",
    "api",
    "app",
    "auth",
    "contact",
    "design-system",
    "discover",
    "feedback",
    "help",
    "hostmaster",
    "info",
    "login",
    "logout",
    "mail",
    "me",
    "mod",
    "moderator",
    "moderators",
    "new",
    "no-reply",
    "noreply",
    "official",
    "password",
    "postmaster",
    "privacy",
    "project",
    "projects",
    "root",
    "security",
    "settings",
    "signup",
    "staff",
    "static",
    "support",
    "system",
    "team",
    "terms",
    "theme",
    "webmaster",
]


def validate_username(value: str) -> None:
    if not USERNAME_PATTERN.fullmatch(value):
        raise ValidationError(
            "Use 3 to 30 characters: lowercase letters, digits, hyphens and underscores. "
            "Start with a letter or digit.",
            code="invalid_username",
        )


class MaximumLengthValidator:
    """Upper bound for passwords. NIST SP 800-63B-4 asks to allow at least 64 characters; the
    bound only protects against absurdly large inputs."""

    def __init__(self, max_length: int = 256) -> None:
        self.max_length = max_length

    def validate(self, password: str, user=None) -> None:
        if len(password) > self.max_length:
            raise ValidationError(
                f"This password is too long (at most {self.max_length} characters).",
                code="password_too_long",
            )

    def get_help_text(self) -> str:
        return f"Your password can be up to {self.max_length} characters long."
