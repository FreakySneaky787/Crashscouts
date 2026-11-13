"""Custom user model (decisions: docs/OPEN-QUESTIONS.md, D/L/M; ADR 0004 and 0009).

- Login is by email only. Email addresses are unique per account, case-insensitively.
- The username is the public handle for profiles: unique case-insensitively, stored lowercase.
- Age is self-confirmed at signup (16+); only the time of the confirmation is stored, never a
  date of birth.
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower

from .validators import validate_username


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(
        "username",
        max_length=30,
        unique=True,
        validators=[validate_username],
        help_text="3 to 30 characters: lowercase letters, digits, hyphens and underscores.",
        error_messages={"unique": "This username is already taken."},
    )
    email = models.EmailField("email address", blank=True)
    age_confirmed_at = models.DateTimeField(
        "age confirmed at",
        null=True,
        blank=True,
        help_text="When the user confirmed being at least 16 years old (self-declaration).",
    )
    # Account deletion with a grace period (owner's decision): hidden at once, deleted for good
    # after this point in time by `manage.py purge_deleted_accounts`, cancelled by signing in.
    # Platform role (WP 3B.1, ADR 0018). Separate from Django's is_staff (Django admin, SSH only).
    # Effective only with active two-factor authentication (apps/accounts/roles.py).
    platform_role = models.CharField(
        max_length=10,
        choices=[("", "None"), ("moderator", "Moderator"), ("admin", "Admin")],
        default="",
        blank=True,
    )
    deletion_scheduled_for = models.DateTimeField(
        "deletion scheduled for", null=True, blank=True, db_index=True
    )

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(Lower("username"), name="accounts_user_username_ci_unique"),
            # Empty emails are only possible for accounts created outside the signup flow (e.g.
            # management commands); every non-empty email must be unique, ignoring letter case.
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_unique",
                condition=~models.Q(email=""),
            ),
        ]

    def __str__(self) -> str:
        return self.username
