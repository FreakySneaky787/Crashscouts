"""Eigenes Benutzermodell ab Tag 1 (nachträglicher Wechsel ist in Django sehr aufwendig).

Bewusst minimal: Registrierung, E-Mail-Regeln, Altersbestätigung und Profil folgen in Phase 1
(django-allauth, siehe docs/adr/0004-authentisierung-mit-allauth.md).
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
