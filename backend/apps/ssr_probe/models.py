from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class ProbeItem(BaseModel):
    """Placeholder object: public for everyone, or private and visible to its owner only."""

    title = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True)
    is_public = models.BooleanField(default=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    touch_count = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return self.title
