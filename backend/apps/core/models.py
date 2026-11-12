"""Shared abstract base models.

Decision (2026-11-12): all our own models use a random UUID (version 4) as primary key. It reveals
neither record counts nor creation time and cannot be guessed.
"""

import uuid

from django.db import models


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimeStampedModel):
    """Default base for domain models: UUIDv4 primary key and timestamps."""

    class Meta:
        abstract = True
