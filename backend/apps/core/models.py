"""Gemeinsame abstrakte Basismodelle.

Entscheidung (2026-11-12): Alle eigenen Modelle verwenden eine zufällige UUID (Version 4) als
Primärschlüssel. Sie verrät weder Anzahl noch Erstellzeitpunkt und ist nicht erratbar.
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
    """Standard-Basis für fachliche Modelle: UUIDv4-Primärschlüssel und Zeitstempel."""

    class Meta:
        abstract = True
