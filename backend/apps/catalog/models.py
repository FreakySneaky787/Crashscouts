"""Fixed lists (taxonomies) shared by profiles and, from phase 2, by projects.

The entries are curated by the platform (seeded by a data migration, editable by staff), not
free tags: they stay filterable and need no moderation (owner's decision, WP 1.2).
"""

from django.db import models

from apps.core.models import UUIDModel


class CatalogItem(UUIDModel):
    slug = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=80)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ["position", "name"]

    def __str__(self) -> str:
        return self.name


class Category(CatalogItem):
    """Software categories; on profiles they are the user's interests."""

    class Meta(CatalogItem.Meta):
        verbose_name_plural = "categories"


class Platform(CatalogItem):
    """Operating systems and device types."""


class Skill(CatalogItem):
    """Testing skills a tester can offer."""
