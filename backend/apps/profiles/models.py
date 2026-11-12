"""Public profile of a user (decision D, docs/OPEN-QUESTIONS.md).

Privacy by default (GDPR art. 25): publicly visible are only the username and the avatar. Every
other field is shown only when its owner switches it on; search engines may index a profile only
after an explicit opt-in.
"""

from django.conf import settings
from django.core.validators import URLValidator
from django.db import models

from apps.catalog.models import Category, Platform, Skill
from apps.core.models import BaseModel

BIO_MAX_LENGTH = 500


class Profile(BaseModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    bio = models.TextField(max_length=BIO_MAX_LENGTH, blank=True)
    link = models.URLField(
        max_length=200,
        blank=True,
        validators=[URLValidator(schemes=["https"])],
        help_text="One https link, e.g. a website or a code hosting profile.",
    )
    interests = models.ManyToManyField(Category, blank=True, related_name="+")
    platforms = models.ManyToManyField(Platform, blank=True, related_name="+")
    skills = models.ManyToManyField(Skill, blank=True, related_name="+")
    # Random name of the stored avatar (avatars/<key>.webp); a new upload gets a new key.
    avatar_key = models.UUIDField(null=True, blank=True, unique=True, editable=False)

    show_bio = models.BooleanField(default=False)
    show_link = models.BooleanField(default=False)
    show_interests = models.BooleanField(default=False)
    show_platforms = models.BooleanField(default=False)
    show_skills = models.BooleanField(default=False)
    indexable = models.BooleanField(
        default=False, help_text="Allow search engines to index the public profile."
    )

    def __str__(self) -> str:
        return f"Profile of {self.user}"
