"""Custom user model from day one (switching later is very costly in Django).

Deliberately minimal: signup, email rules, age confirmation and profile follow in phase 1
(django-allauth, see docs/adr/0004-authentication-with-allauth.md).
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self) -> str:
        return self.username
